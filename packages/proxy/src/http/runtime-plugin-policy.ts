import { findPlugin, pluginCatalog, type MolenkopfPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import { parsePluginPolicyState, resolveTeamPolicies, type PluginPolicyStore, type ResolvedPluginPolicy } from "../../../core/src/plugins/plugin-policy.ts";
import { builtinPluginDescriptorV2 } from "./plugin-platform.ts";

export type { PluginPolicyStore };

export type RuntimeRequestState = {
  pluginEnabled: Record<string, boolean>;
  pluginPolicyState?: PluginPolicyStore;
};

export type RuntimeRequestPolicy = { teamIds?: readonly string[] };

export function buildRuntimePluginPolicyState(raw: unknown, legacyEnabled?: Record<string, boolean>): { state: PluginPolicyStore; warnings: string[] } {
  const descriptors = builtinPluginDescriptorV2();
  const result = parsePluginPolicyState(raw ?? {}, descriptors);
  const warnings = [...(result.warnings || [])];
  return { state: migrateLegacyPluginEnabled(result.state, legacyEnabled), warnings };
}

export function resolveRequestPluginPolicy(state: RuntimeRequestState, teamId: string | undefined, pluginId: string): ResolvedPluginPolicy | undefined {
  const descriptors = builtinPluginDescriptorV2();
  const lookup = new Map(resolveTeamPolicies(state.pluginPolicyState ?? {
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {},
    teamPluginPolicies: []
  }, descriptors, teamId));
  const policy = lookup.get(pluginId);
  return policy;
}

export function resolveRequestPluginIds(state: RuntimeRequestState, teamIds?: readonly string[], agentEnabledPluginIds?: readonly string[]): string[] {
  const descriptors = builtinPluginDescriptorV2();
  const teamId = teamIds?.[0];
  const agentAllowed = agentEnabledPluginIds === undefined ? undefined : new Set(agentEnabledPluginIds);
  const policyState = state.pluginPolicyState ?? {
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {},
    teamPluginPolicies: []
  };
  const policies = resolveTeamPolicies(policyState, descriptors, teamId);
  const result: string[] = [];
  for (const [id, policy] of policies) {
    if (!policy.enabled) continue;
    if (agentAllowed && !agentAllowed.has(id)) continue;
    if (!requestBodyHookAllowed(id, policy)) continue;
    result.push(id);
  }
  return result;
}

export function resolveEffectivePluginPolicy(
  state: RuntimeRequestState,
  pluginId: string,
  teamIds?: readonly string[]
): ResolvedPluginPolicy | undefined {
  const descriptors = builtinPluginDescriptorV2();
  const policyState = state.pluginPolicyState ?? {
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {},
    teamPluginPolicies: []
  };
  const policyById = resolveTeamPolicies(policyState, descriptors, teamIds?.[0]).get(pluginId);
  if (!policyById) return undefined;
  return { ...policyById };
}

export function isPluginEnabledForRequest(state: RuntimeRequestState, teamIds: readonly string[] | undefined, pluginId: string): boolean {
  const policy = resolveEffectivePluginPolicy(state, pluginId, teamIds);
  return policy ? policy.enabled : false;
}

export function isPluginAllowedForRequest(
  state: RuntimeRequestState,
  teamIds: readonly string[] | undefined,
  pluginId: string,
  capability: string
): boolean {
  const policy = resolveEffectivePluginPolicy(state, pluginId, teamIds);
  return Boolean(policy?.enabled && policy.capabilities.includes(capability));
}

export function isPluginEnabled(state: RuntimeRequestState, id: string): boolean {
  const plugin = pluginCatalog.find((item) => item.id === id);
  return plugin ? state.pluginEnabled[id] ?? plugin.enabledByDefault : false;
}

export function enabledPluginIds(state: RuntimeRequestState): string[] {
  return collectEnabledPluginIds(state);
}

function collectEnabledPluginIds(state: RuntimeRequestState): string[] {
  return pluginCatalog.filter((plugin) => isPluginEnabled(state, plugin.id)).map((plugin) => plugin.id);
}

function migrateLegacyPluginEnabled(state: PluginPolicyStore, legacyEnabled: Record<string, boolean> | undefined): PluginPolicyStore {
  if (!legacyEnabled) return state;
  const ids = new Set(builtinPluginDescriptorV2().map((descriptor) => descriptor.id));
  const globalPluginPolicy = { ...state.globalPluginPolicy };
  let changed = false;
  for (const [id, enabled] of Object.entries(legacyEnabled)) {
    if (!ids.has(id) || typeof enabled !== "boolean" || globalPluginPolicy[id]?.enabled !== undefined) continue;
    globalPluginPolicy[id] = { ...(globalPluginPolicy[id] ?? {}), enabled };
    changed = true;
  }
  return changed ? { ...state, globalPluginPolicy } : state;
}

function requestBodyHookAllowed(pluginId: string, policy: ResolvedPluginPolicy): boolean {
  const plugin = findPlugin(pluginId);
  if (!plugin?.hooks.includes("request:body:rewrite")) return true;
  return requestBodyHookCapabilities(plugin).every((capability) => policy.capabilities.includes(capability));
}

function requestBodyHookCapabilities(plugin: MolenkopfPlugin): string[] {
  const capabilities: string[] = [];
  if (plugin.traffic.reads.some((item) => item === "redacted-body" || item === "body")) capabilities.push("body:redacted:read");
  if (plugin.traffic.mutates.some((item) => item !== "none")) capabilities.push("body:write");
  return [...new Set(capabilities)];
}
