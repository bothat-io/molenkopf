import type { AuditStore, AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import { findPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import { pluginView } from "./local-api-state.ts";
import { type RuntimeState } from "./runtime-state.ts";
import { auditViews } from "./audit-view.ts";
import { auditFilterForUser } from "./local-api-scope.ts";
import { canManage, type AuthUser } from "./auth-state.ts";
import { auditPath } from "./request-path.ts";
import type { PluginHost } from "./plugin-host.ts";
import { safePluginOutput } from "./plugin-output-safety.ts";
import { resolveEffectivePluginPolicy } from "./runtime-state.ts";

type PluginDataResult = { status: number; payload: unknown };

export async function buildPluginData(id: string, audit: AuditStore, state: RuntimeState, user: AuthUser | undefined, host: PluginHost): Promise<PluginDataResult> {
  const plugin = findPlugin(id);
  if (!plugin) return { status: 404, payload: { error: "plugin_not_found" } };
  if (!plugin.dataPath) return { status: 404, payload: { error: "plugin_data_not_found" } };
  const policy = resolveEffectivePluginPolicy(state, id, user?.teamIds);
  if (!policy || !canReadPluginData(policy.capabilities)) return { status: 403, payload: { error: "plugin_data_forbidden" } };
  const scope = canManage(state, user) ? "adminSafe" : "strict";
  const result = await host.data(id, {
    canManage: canManage(state, user),
    userId: user?.id,
    teamIds: user?.teamIds ?? [],
    scope: "data",
    plugin: pluginView(plugin, state) as unknown as Record<string, unknown>,
    scopes: plugin.dataScopes ?? [],
    manifests: await scopedManifests(audit, state, user),
    memoryGraph: state.memoryGraph
  });
  if (result.ok !== true) return { status: result.status, payload: { error: result.error === "plugin_data_not_found" ? "plugin_data_not_found" : "plugin_runtime_failed" } };
  return { status: 200, payload: safePluginOutput(id, result.payload, scope) };
}

async function scopedManifests(audit: AuditStore, state: RuntimeState, user?: AuthUser): Promise<AuditManifest[]> {
  const page = await audit.listPage({ limit: 200, newestFirst: true, filter: auditFilterForUser(state, user) });
  return auditViews(page.items).filter(isAgentTraffic);
}

function isAgentTraffic(manifest: AuditManifest): boolean {
  const path = auditPath(manifest.path);
  return !path.startsWith("/.well-known/appspecific/") && path !== "/favicon.ico";
}

function canReadPluginData(capabilities: readonly string[]): boolean {
  return capabilities.includes("audit:read:scoped") || capabilities.includes("audit:read:all") || capabilities.includes("metadata:read");
}
