import { pluginCatalog } from "../../../core/src/plugins/plugin-catalog.ts";
import { clientIdForAgent } from "./client-identity.ts";
import { CONTROL_PLANE_LIMITS, emptyUsage, enabledPluginIds, type AgentDraftMetadata, type AgentDraftView, type RuntimeState, type RuntimeStateResult } from "./runtime-state.ts";

export function listAgentDrafts(state: RuntimeState): AgentDraftView[] {
  return state.agentDrafts.slice(0, CONTROL_PLANE_LIMITS.agentDrafts).map((draft) => viewDraft(draft, state));
}

export function upsertAgentDraft(state: RuntimeState, input: Record<string, unknown>, now = new Date().toISOString()): RuntimeStateResult<AgentDraftView> {
  const rawField = rawCredentialField(input);
  if (rawField) return fail(400, "raw_token_rejected", `${rawField} must be sent as tokenHash`);

  const id = cleanId(input.id);
  if (!id) return fail(400, "invalid_agent_id");
  const existingIndex = state.agentDrafts.findIndex((item) => item.id === id);
  const existing = existingIndex >= 0 ? state.agentDrafts[existingIndex] : undefined;
  if (!existing && state.agentDrafts.length >= CONTROL_PLANE_LIMITS.agentDrafts) return fail(409, "agent_draft_limit");

  const label = cleanLabel(input.label ?? input.name ?? existing?.label ?? id);
  if (!label) return fail(400, "invalid_agent_label");
  const kind = cleanAgentKind(input.kind ?? existing?.kind ?? "CI agent");
  const providerId = cleanId(input.providerId ?? existing?.providerId ?? state.activeProviderId);
  const provider = providerId ? state.providers.find((item) => item.id === providerId) : undefined;
  if (!provider) return fail(404, "unknown_provider");
  if (provider.enabled === false) return fail(409, "provider_disabled");

  const plugins = normalizePluginIds(input.enabledPluginIds ?? input.pluginIds, state, existing);
  if (plugins.ok === false) return plugins;
  const tokenHash = normalizeTokenHash(input, existing);
  if (tokenHash.ok === false) return tokenHash;

  let tokenLimit = existing?.tokenLimit;
  if (input.tokenLimit !== undefined) {
    if (input.tokenLimit === null || input.tokenLimit === 0) tokenLimit = undefined;
    else if (typeof input.tokenLimit === "number" && Number.isInteger(input.tokenLimit) && input.tokenLimit > 0) tokenLimit = input.tokenLimit;
    else return fail(400, "invalid_token_limit");
  }
  const disabled = typeof input.disabled === "boolean" ? input.disabled : existing?.disabled;

  const draft: AgentDraftMetadata = { id, label, kind, providerId: provider.id, enabledPluginIds: plugins.value, status: "draft", createdAt: existing?.createdAt ?? now, updatedAt: now };
  if (tokenHash.value) {
    draft.tokenHash = tokenHash.value;
    draft.tokenHashAlgorithm = "sha256";
  }
  if (disabled) draft.disabled = true;
  if (tokenLimit) draft.tokenLimit = tokenLimit;
  if (existingIndex >= 0) state.agentDrafts[existingIndex] = draft;
  else state.agentDrafts.push(draft);
  return { ok: true, value: viewDraft(draft, state) };
}

function normalizePluginIds(input: unknown, state: RuntimeState, existing?: AgentDraftMetadata): RuntimeStateResult<string[]> {
  if (input === undefined) return { ok: true, value: existing?.enabledPluginIds ?? enabledPluginIds(state) };
  if (!Array.isArray(input) || input.length > CONTROL_PLANE_LIMITS.pluginIds) return fail(400, "invalid_plugin_ids");
  const known = new Set(pluginCatalog.map((plugin) => plugin.id));
  const ids = [...new Set(input.map(cleanId))];
  if (ids.some((id) => !id)) return fail(400, "invalid_plugin_id");
  const unknown = ids.find((id) => !known.has(id as string));
  if (unknown) return fail(404, "unknown_plugin", unknown);
  return { ok: true, value: ids as string[] };
}

function normalizeTokenHash(input: Record<string, unknown>, existing?: AgentDraftMetadata): RuntimeStateResult<string | undefined> {
  if (input.tokenHash === undefined) return { ok: true, value: existing?.tokenHash };
  if (input.tokenHash === null || input.tokenHash === "") return { ok: true, value: undefined };
  if (input.tokenHashAlgorithm !== undefined && input.tokenHashAlgorithm !== "sha256") return fail(400, "unsupported_token_hash");
  if (typeof input.tokenHash !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(input.tokenHash)) return fail(400, "invalid_token_hash");
  const hash = input.tokenHash.toLowerCase();
  return { ok: true, value: hash.startsWith("sha256:") ? hash : `sha256:${hash}` };
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id.length <= CONTROL_PLANE_LIMITS.idLength && /^[a-z0-9][a-z0-9._:-]*$/i.test(id) ? id : undefined;
}

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.trim().replace(/\s+/g, " ");
  return label && label.length <= CONTROL_PLANE_LIMITS.labelLength ? label : undefined;
}

function cleanAgentKind(value: unknown): AgentDraftMetadata["kind"] {
  return value === "Local agent" || value === "External agent" ? value : "CI agent";
}

function rawCredentialField(input: Record<string, unknown>): string | undefined {
  const forbidden = new Set(["token", "apikey", "api_key", "secret", "credential", "password", "authorization"]);
  return Object.keys(input).find((key) => forbidden.has(key.toLowerCase()));
}

function viewDraft(draft: AgentDraftMetadata, state: RuntimeState): AgentDraftView {
  const { tokenHash, ...rest } = draft;
  const usage = state.usageByAgent[clientIdForAgent(draft.id)] ?? emptyUsage();
  const view: AgentDraftView = { ...rest, enabledPluginIds: [...draft.enabledPluginIds], tokenHashPresent: Boolean(tokenHash), usage: { ...usage } };
  if (tokenHash) view.tokenFingerprint = tokenHash.slice(0, 15);
  return view;
}

function fail(status: number, error: string, reason?: string): RuntimeStateResult<never> {
  return { ok: false, status, error, reason };
}
