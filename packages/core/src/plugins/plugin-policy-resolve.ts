import type { PluginDescriptorV2 } from "./plugin-descriptor-v2.ts";
import { defaultSettings, resolveSettingsPolicy } from "./plugin-policy-settings.ts";
import { RISK_INDEX, isRisk, type PluginPolicyOverrides, type PluginPolicyStore, type PolicyActionCheck, type ResolvedPluginPolicy, type ResolvedPolicySource, type RoleCheck } from "./plugin-policy-types.ts";

export function resolveTeamPolicies(state: PluginPolicyStore, descriptors: readonly PluginDescriptorV2[], teamId: string): Map<string, ResolvedPluginPolicy> {
  return new Map(descriptors.map((descriptor) => [descriptor.id, resolveEffectivePluginPolicy(descriptor, state, teamId)]));
}

export function resolveEffectivePluginPolicy(descriptor: PluginDescriptorV2, state: PluginPolicyStore, teamId?: string): ResolvedPluginPolicy {
  const source: ResolvedPolicySource = { enabled: "global", maxRisk: "global", capabilities: "global", actions: "global", settings: {} };
  const blockedReasons: string[] = [];
  const defaults = descriptor.defaultPolicy;
  const global = state.globalPluginPolicy[descriptor.id] ?? {};
  const team = pickTeamOverride(state.teamPluginPolicies, descriptor.id, teamId);
  return {
    pluginId: descriptor.id,
    enabled: resolveBooleanPolicy(defaults.enabled, global.enabled, team.enabled, source, blockedReasons),
    maxRisk: resolveRiskPolicy(defaults.maxRisk, global.maxRisk, team.maxRisk, source, blockedReasons),
    capabilities: resolveArrayPolicy("capabilities", defaults.capabilities, global.capabilities, team.capabilities, source, blockedReasons),
    actions: resolveArrayPolicy("actions", defaults.actions, global.actions, team.actions, source, blockedReasons),
    settings: resolveSettingsPolicy(descriptor.settingsSchema, defaultSettings(descriptor.settingsSchema), global.settings ?? {}, team.settings ?? {}, source.settings, blockedReasons),
    source,
    blockedReasons: [...new Set(blockedReasons)]
  };
}

export function resolveActionPermission(action: PolicyActionCheck, policy: ResolvedPluginPolicy): { ok: boolean; code?: string } {
  if (!policy.enabled) return { ok: false, code: "plugin_disabled" };
  if (!policy.actions.includes(action.id)) return { ok: false, code: "plugin_action_forbidden" };
  if (!isRisk(action.risk) || RISK_INDEX.get(action.risk)! > RISK_INDEX.get(policy.maxRisk)!) return { ok: false, code: "plugin_risk_violation" };
  return action.requiredCapabilities.some((capability) => !policy.capabilities.includes(capability))
    ? { ok: false, code: "plugin_capability_violation" }
    : { ok: true };
}

export function resolvePluginActionRole(action: RoleCheck, role: "member" | "manager" | "admin", allowManager = false): boolean {
  if (action.requiredRole === "member") return true;
  if (action.requiredRole === "admin") return role === "admin";
  return role === "admin" || (allowManager && role === "manager");
}

function pickTeamOverride(policies: readonly { teamId: string; pluginId: string; overrides: PluginPolicyOverrides }[], pluginId: string, teamId?: string): PluginPolicyOverrides {
  if (!teamId) return {};
  return policies.slice().reverse().find((policy) => policy.teamId === teamId && policy.pluginId === pluginId)?.overrides ?? {};
}

function resolveBooleanPolicy(defaultValue: boolean, global: boolean | undefined, team: boolean | undefined, source: ResolvedPolicySource, blocked: string[]): boolean {
  const afterGlobal = global === undefined ? defaultValue : global;
  if (team === undefined) return afterGlobal;
  if (global === false && team === true) {
    blocked.push("team_disabled");
    source.enabled = "blocked";
    return false;
  }
  source.enabled = "team";
  return team;
}

function resolveRiskPolicy(defaultRisk: ResolvedPluginPolicy["maxRisk"], global: ResolvedPluginPolicy["maxRisk"] | undefined, team: ResolvedPluginPolicy["maxRisk"] | undefined, source: ResolvedPolicySource, blocked: string[]) {
  const effectiveGlobal = isRisk(global) ? global : defaultRisk;
  if (!team) return effectiveGlobal;
  if (!isRisk(team)) return blockRisk(effectiveGlobal, source, blocked, "team_risk_invalid");
  if (RISK_INDEX.get(team)! > RISK_INDEX.get(effectiveGlobal)!) return blockRisk(effectiveGlobal, source, blocked, "team_risk_exceeds_global");
  source.maxRisk = "team";
  return team;
}

function blockRisk(value: ResolvedPluginPolicy["maxRisk"], source: ResolvedPolicySource, blocked: string[], reason: string) {
  blocked.push(reason);
  source.maxRisk = "blocked";
  return value;
}

function resolveArrayPolicy(
  field: "capabilities" | "actions",
  defaultValue: readonly string[],
  global: readonly string[] | undefined,
  team: readonly string[] | undefined,
  source: ResolvedPolicySource,
  blocked: string[]
): string[] {
  const afterGlobal = global !== undefined ? defaultValue.filter((item) => global.includes(item)) : [...defaultValue];
  if (team === undefined) return afterGlobal;
  const next = afterGlobal.filter((item) => team.includes(item));
  source[field] = "team";
  if (team.some((item) => !afterGlobal.includes(item))) blocked.push(`team_${field}_exceeds_global`);
  return next;
}
