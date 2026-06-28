import type { IncomingMessage, ServerResponse } from "node:http";
import { findPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import { pluginView } from "./local-api-state.ts";
import type { PluginActionDescriptor } from "../../../core/src/plugins/plugin-descriptor-v2.ts";
import { validatePluginSettings } from "../../../core/src/plugins/plugin-settings-schema.ts";
import { pluginPolicySchemaVersion, parsePluginPolicyState, resolveActionPermission } from "../../../core/src/plugins/plugin-policy.ts";
import { normalizePluginSettings } from "../../../core/src/plugins/plugin-settings-schema.ts";
import { builtinPluginDescriptorV2 } from "./plugin-platform.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import { canManage, type AuthUser } from "./auth-state.ts";
import type { PluginHost } from "./plugin-host.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { safePluginOutput } from "./plugin-output-safety.ts";
import { resolveEffectivePluginPolicy } from "./runtime-plugin-policy.ts";

export async function togglePlugin(req: IncomingMessage, res: ServerResponse, state: RuntimeState, pluginHost?: PluginHost) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const plugin = findPlugin(id);
  if (!plugin) return writeJson(res, 404, { error: "unknown_plugin" });
  if (typeof body.enabled !== "boolean") return writeJson(res, 400, { error: "invalid_enabled" });
  const previousEnabled = state.pluginEnabled[id], previousUpdated = state.pluginUpdatedAt[id];
  const previousPolicyState = snapshotPluginPolicyState(state);
  state.pluginEnabled[id] = body.enabled;
  state.pluginUpdatedAt[id] = new Date().toISOString();
  const policyResult = buildPluginPolicyStateFromGlobalOverride(state, id, body.enabled);
  if (!policyResult.ok) return restorePluginState(state, id, previousEnabled, previousUpdated, previousPolicyState), writeJson(res, 400, { error: "invalid_plugin_override", warnings: policyResult.warnings });
  state.pluginPolicyState = policyResult.state;
  try { await persistRuntimeSettings(state); } catch {
    restorePluginState(state, id, previousEnabled, previousUpdated, previousPolicyState);
    return writeJson(res, 500, { error: "persist_failed" });
  }
  if (pluginHost) await (body.enabled ? pluginHost.enable(id) : pluginHost.disable(id));
  writeJson(res, 200, pluginView(plugin, state));
}

export async function runPluginAction(req: IncomingMessage, res: ServerResponse, state: RuntimeState, user: AuthUser | undefined, pluginHost?: PluginHost) {
  const path = new URL(req.url ?? "/", "http://local").pathname;
  const match = path.match(/^\/__molenkopf\/plugins\/([^/]+)\/actions\/([^/]+)$/);
  if (!match) return writeJson(res, 404, { error: "plugin_action_not_found" });
  const [, pluginId, actionId] = match;
  if (!pluginHost) return writeJson(res, 500, { error: "plugin_runtime_unavailable" });
  const plugin = findPlugin(pluginId);
  if (!plugin) return writeJson(res, 404, { error: "plugin_not_found" });
  if (!req.headers["content-type"]?.includes("application/json")) return writeJson(res, 400, { error: "invalid_action_payload" });
  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return writeJson(res, 400, { error: "plugin_settings_invalid" });
  const descriptors = builtinPluginDescriptorV2();
  const descriptor = descriptors.find((item) => item.id === pluginId);
  if (!descriptor) return writeJson(res, 404, { error: "plugin_not_found" });
  const policy = resolveEffectivePluginPolicy(state, pluginId, user?.teamIds);
  if (!policy) return writeJson(res, 500, { error: "plugin_policy_invalid" });
  if (!policy.enabled) return writeJson(res, 403, { error: "plugin_disabled" });

  const action = descriptor.actions.find((entry) => entry.id === actionId);
  if (!action) return writeJson(res, 404, { error: "plugin_action_not_found" });
  if (!pluginActionRoleAllowed(state, action, user)) return writeJson(res, 403, { error: "plugin_action_forbidden" });
  const permission = resolveActionPermission(action, policy);
  if (!permission.ok) return writeJson(res, 403, { error: permission.code ?? "plugin_action_forbidden" });
  const rawActionPayload = typeof body.input === "object" && !Array.isArray(body.input) ? body.input as Record<string, unknown> : body;
  const settings = validatePluginSettings(action.inputSchema, rawActionPayload);
  if (!settings.ok) return writeJson(res, 400, { error: "plugin_settings_invalid", warnings: settings.errors });
  const normalized = normalizePluginSettings(action.inputSchema, rawActionPayload);
  const result = await pluginHost.action(pluginId, actionId, normalized as Record<string, unknown>, user?.id, user?.teamIds) as { ok: boolean; status?: number; error?: string; payload: unknown };
  if (!result.ok) {
    const fallback = result.error === "plugin_action_not_found" ? "plugin_action_not_found" : "plugin_runtime_failed";
    return writeJson(res, result.status ?? 500, { error: result.error === "plugin_action_not_found" ? "plugin_action_not_found" : fallback });
  }
  const safe = safePluginOutput(pluginId, result.payload, action.outputSafety);
  writeJson(res, 200, safe);
}

function pluginActionRoleAllowed(state: RuntimeState, action: PluginActionDescriptor, user: AuthUser | undefined): boolean {
  if (action.requiredRole === "admin") return canManage(state, user);
  if (action.requiredRole === "manager") return false;
  return true;
}

function buildPluginPolicyStateFromGlobalOverride(state: RuntimeState, id: string, enabled: boolean) {
  const descriptorIds = new Set(builtinPluginDescriptorV2().map((item) => item.id));
  if (!descriptorIds.has(id)) {
    return { ok: false, warnings: ["unknown_plugin_override"], state: state.pluginPolicyState };
  }
  const descriptors = builtinPluginDescriptorV2();
  const globalPluginPolicy = { ...(state.pluginPolicyState.globalPluginPolicy ?? {}) };
  const next = { ...(globalPluginPolicy[id] ?? {}) };
  next.enabled = enabled;
  globalPluginPolicy[id] = next;
  const nextState = {
    ...state.pluginPolicyState,
    pluginPolicySchemaVersion: pluginPolicySchemaVersion,
    globalPluginPolicy
  };
  return parsePluginPolicyState(nextState, descriptors);
}

function snapshotPluginPolicyState(state: RuntimeState) {
  return JSON.parse(JSON.stringify(state.pluginPolicyState)) as RuntimeState["pluginPolicyState"];
}

function restorePluginState(state: RuntimeState, id: string, enabled: boolean | undefined, updatedAt: string | undefined, policyState?: RuntimeState["pluginPolicyState"]): void {
  if (enabled === undefined) delete state.pluginEnabled[id];
  else state.pluginEnabled[id] = enabled;
  if (updatedAt === undefined) delete state.pluginUpdatedAt[id];
  else state.pluginUpdatedAt[id] = updatedAt;
  if (policyState) state.pluginPolicyState = policyState;
}
