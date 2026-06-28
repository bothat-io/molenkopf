import type { PluginDescriptorV2 } from "./plugin-descriptor-v2.ts";
import {
  emptyPolicyState,
  isRisk,
  pluginPolicySchemaVersion,
  type ParseResult,
  type PluginPolicyOverrides,
  type TeamPluginPolicy
} from "./plugin-policy-types.ts";

export function parsePluginPolicyState(raw: unknown, descriptors: readonly PluginDescriptorV2[]): ParseResult {
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("policy-state-invalid-json");
    return { ok: false, warnings, state: emptyPolicyState() };
  }
  const input = raw as Record<string, unknown>;
  const knownIds = new Set(descriptors.map((item) => item.id));
  const version = typeof input.pluginPolicySchemaVersion === "number" ? input.pluginPolicySchemaVersion : pluginPolicySchemaVersion;
  if (version !== pluginPolicySchemaVersion) warnings.push(`policy-version-mismatch:${version}`);
  return {
    ok: warnings.length === 0,
    warnings,
    state: {
      pluginPolicySchemaVersion: version,
      globalPluginPolicy: parseGlobalPolicy(input.globalPluginPolicy, knownIds),
      teamPluginPolicies: parseTeamPolicies(input.teamPluginPolicies, knownIds),
      policyWarnings: parseWarnings(input.policyWarnings),
      lastValidatedAt: typeof input.lastValidatedAt === "string" ? input.lastValidatedAt : new Date().toISOString()
    }
  };
}

function parseGlobalPolicy(raw: unknown, knownIds: Set<string>): Record<string, PluginPolicyOverrides> {
  const out: Record<string, PluginPolicyOverrides> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [pluginId, record] of Object.entries(raw)) {
    if (!knownIds.has(pluginId)) continue;
    const parsed = parseOverrides(record);
    if (parsed) out[pluginId] = parsed;
  }
  return out;
}

function parseTeamPolicies(raw: unknown, knownIds: Set<string>): TeamPluginPolicy[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamPluginPolicy[] = [];
  for (const entry of raw) {
    const parsed = parseTeamPolicy(entry, knownIds);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseTeamPolicy(raw: unknown, knownIds: Set<string>): TeamPluginPolicy | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  const teamId = typeof item.teamId === "string" ? item.teamId.trim() : "";
  const pluginId = typeof item.pluginId === "string" ? item.pluginId.trim() : "";
  const overrides = parseOverrides(item.overrides);
  if (!teamId || !knownIds.has(pluginId) || !overrides) return undefined;
  return { teamId, pluginId, overrides };
}

function parseOverrides(raw: unknown): PluginPolicyOverrides | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const out: PluginPolicyOverrides = {};
  if (typeof input.enabled === "boolean") out.enabled = input.enabled;
  if (isRisk(input.maxRisk)) out.maxRisk = input.maxRisk;
  if (Array.isArray(input.capabilities)) out.capabilities = input.capabilities.filter(isString);
  if (Array.isArray(input.actions)) out.actions = input.actions.filter(isString);
  if (input.settings && typeof input.settings === "object" && !Array.isArray(input.settings)) out.settings = { ...input.settings };
  return out;
}

function parseWarnings(raw: unknown): string[] | undefined {
  return Array.isArray(raw) ? raw.filter(isString) : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
