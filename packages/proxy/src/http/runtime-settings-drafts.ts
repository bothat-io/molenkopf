import { CONTROL_PLANE_LIMITS, type AgentDraftMetadata } from "./runtime-types.ts";

export function cleanDrafts(value: unknown): AgentDraftMetadata[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, CONTROL_PLANE_LIMITS.agentDrafts).filter(isDraft).map(persistedDraft);
}

export function persistedDraft(draft: AgentDraftMetadata): AgentDraftMetadata {
  const enabledPluginIds = [...new Set((Array.isArray(draft.enabledPluginIds) ? draft.enabledPluginIds : []).filter(idOk))].slice(0, CONTROL_PLANE_LIMITS.pluginIds);
  const copy: AgentDraftMetadata = { ...draft, enabledPluginIds };
  const tokenHash = cleanTokenHash((draft as unknown as Record<string, unknown>).tokenHash);
  delete copy.tokenHash;
  delete copy.tokenHashAlgorithm;
  if (tokenHash) {
    copy.tokenHash = tokenHash;
    copy.tokenHashAlgorithm = "sha256";
  }
  return copy;
}

function isDraft(value: unknown): value is AgentDraftMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return idOk(item.id) && idOk(item.providerId) && labelOk(item.label) && kindOk(item.kind) && pluginIdsOk(item.enabledPluginIds) && draftTokenOk(item) && optionalBool(item.disabled) && optionalLimit(item.tokenLimit) && typeof item.createdAt === "string" && typeof item.updatedAt === "string" && item.status === "draft";
}

function labelOk(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= CONTROL_PLANE_LIMITS.labelLength;
}

function kindOk(value: unknown): value is AgentDraftMetadata["kind"] {
  return value === "CI agent" || value === "Local agent" || value === "External agent";
}

function pluginIdsOk(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= CONTROL_PLANE_LIMITS.pluginIds && value.every(idOk);
}

function draftTokenOk(item: Record<string, unknown>): boolean {
  if (item.tokenHash === undefined) return item.tokenHashAlgorithm === undefined;
  return cleanTokenHash(item.tokenHash) !== undefined && (item.tokenHashAlgorithm === undefined || item.tokenHashAlgorithm === "sha256");
}

function cleanTokenHash(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(value)) return undefined;
  const hash = value.toLowerCase();
  return hash.startsWith("sha256:") ? hash : `sha256:${hash}`;
}

function optionalBool(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function optionalLimit(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function idOk(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(value);
}
