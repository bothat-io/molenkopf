import { builtinPluginDescriptors } from "../plugins/plugin-descriptor.ts";

export type ProfilePolicy = { id: string; providerId: string; allowedModels?: string[]; defaultModel?: string };
export type PluginPolicy = { id: string; enabledPluginIds?: string[] };
export type ResolvedAgent = {
  id: string;
  providerId: string;
  enabled?: boolean;
  profileId?: string;
  pluginPolicyId?: string;
  scopes?: string[];
  allowedModels?: string[];
  defaultModel?: string;
  enabledPluginIds?: string[];
};

type JsonRecord = Record<string, unknown>;

const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;

export function normalizePolicyConfig(root: JsonRecord, providerIds: Set<string>, enabledProviderIds: Set<string>) {
  const profiles = normalizeProfiles(root.profiles, providerIds);
  const pluginPolicies = normalizePluginPolicies(root.pluginPolicies);
  return {
    profiles: profiles.items,
    pluginPolicies: pluginPolicies.items,
    agents: normalizeAgents(root.agents, profiles, pluginPolicies, providerIds, enabledProviderIds),
    firstProvider: profiles.items[0]?.providerId
  };
}

function normalizeProfiles(input: unknown, providerIds: Set<string>): { items: ProfilePolicy[]; byId: Map<string, ProfilePolicy> } {
  if (input === undefined) return { items: [], byId: new Map() };
  const items = array(input, "$.profiles").map((item, index) => {
    const profile = record(item, `$.profiles[${index}]`);
    const id = idValue(profile.id, `$.profiles[${index}].id`);
    const providerId = idValue(profile.providerId, `$.profiles[${index}].providerId`);
    if (!providerIds.has(providerId)) throw new Error(`unknown provider in profile: ${providerId}`);
    const allowedModels = uniqueStrings(profile.allowedModels, `$.profiles[${index}].allowedModels`);
    const defaultModel = stringOrUndefined(profile.defaultModel, `$.profiles[${index}].defaultModel`);
    if (defaultModel && allowedModels && !allowedModels.includes(defaultModel)) throw new Error(`default model not allowed: ${id}`);
    return clean({ id, providerId, allowedModels, defaultModel });
  });
  assertUnique(items.map((item) => item.id), "profile");
  return { items, byId: new Map(items.map((item) => [item.id, item])) };
}

function normalizePluginPolicies(input: unknown): { items: PluginPolicy[]; byId: Map<string, PluginPolicy> } {
  if (input === undefined) return { items: [], byId: new Map() };
  const builtinPluginIds = new Set(builtinPluginDescriptors.map((plugin) => plugin.id));
  const items = array(input, "$.pluginPolicies").map((item, index) => {
    const policy = record(item, `$.pluginPolicies[${index}]`);
    const id = idValue(policy.id, `$.pluginPolicies[${index}].id`);
    if (policy.remotePlugins === true) throw new Error(`remote plugins unsupported: ${id}`);
    const enabledPluginIds = uniqueStrings(policy.enabledPluginIds, `$.pluginPolicies[${index}].enabledPluginIds`);
    enabledPluginIds?.forEach((pluginId) => {
      if (!builtinPluginIds.has(pluginId)) throw new Error(`unknown enabled plugin id: ${pluginId}`);
    });
    return clean({ id, enabledPluginIds });
  });
  assertUnique(items.map((item) => item.id), "plugin policy");
  return { items, byId: new Map(items.map((item) => [item.id, item])) };
}

function normalizeAgents(input: unknown, profiles: ReturnType<typeof normalizeProfiles>, policies: ReturnType<typeof normalizePluginPolicies>, providerIds: Set<string>, enabledProviderIds: Set<string>): ResolvedAgent[] {
  if (input === undefined) return [];
  const agents = array(input, "$.agents").map((item, index) => {
    const agent = record(item, `$.agents[${index}]`);
    const id = idValue(agent.id, `$.agents[${index}].id`);
    const enabled = agent.enabled === undefined ? true : boolean(agent.enabled, `$.agents[${index}].enabled`);
    const profileId = optionalId(agent.profileId, `$.agents[${index}].profileId`);
    const pluginPolicyId = optionalId(agent.pluginPolicyId, `$.agents[${index}].pluginPolicyId`);
    const profile = profileId ? profiles.byId.get(profileId) : undefined;
    const policy = pluginPolicyId ? policies.byId.get(pluginPolicyId) : undefined;
    if (profileId && !profile) throw new Error(`unknown profile in agent: ${profileId}`);
    if (pluginPolicyId && !policy) throw new Error(`unknown plugin policy in agent: ${pluginPolicyId}`);
    if (agent.providerId !== undefined && profileId) throw new Error(`conflicting provider/profile in agent: ${id}`);
    const providerId = agent.providerId !== undefined ? idValue(agent.providerId, `$.agents[${index}].providerId`) : profile?.providerId;
    if (!providerId) throw new Error(`agent requires provider or profile: ${id}`);
    if (!providerIds.has(providerId)) throw new Error(`unknown provider in agent: ${providerId}`);
    if (enabled && !enabledProviderIds.has(providerId)) throw new Error(`agent provider disabled: ${providerId}`);
    return clean({ id, providerId, enabled, profileId, pluginPolicyId, scopes: nonEmptyUniqueIds(agent.scopes, `$.agents[${index}].scopes`), allowedModels: profile?.allowedModels, defaultModel: profile?.defaultModel, enabledPluginIds: policy?.enabledPluginIds });
  });
  assertUnique(agents.map((item) => item.id), "agent");
  return agents;
}

function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`expected object: ${path}`);
  return value as JsonRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`expected array: ${path}`);
  return value;
}

function optionalId(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : idValue(value, path);
}

function idValue(value: unknown, path: string): string {
  const id = string(value, path);
  if (!ID_RE.test(id)) throw new Error(`invalid id: ${path}`);
  return id;
}

function uniqueStrings(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  const values = array(value, path).map((item, index) => string(item, `${path}[${index}]`));
  return assertUnique(values, path), values;
}

function nonEmptyUniqueIds(value: unknown, path: string): string[] | undefined {
  const values = uniqueStrings(value, path);
  if (values === undefined) return undefined;
  if (!values.length) throw new Error(`empty string array: ${path}`);
  values.forEach((item, index) => idValue(item, `${path}[${index}]`));
  return values;
}

function stringOrUndefined(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`expected string: ${path}`);
  return value.trim();
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`expected boolean: ${path}`);
  return value;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) throw new Error(`duplicate ${label} id: ${value}`);
    seen.add(value);
  });
}

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
