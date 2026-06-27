import { validatePluginSettings } from "./plugin-settings-schema.ts";
import type { PluginMiniSchema, PluginSettingMergeStrategy } from "./plugin-settings-schema.ts";
import type { PluginDescriptorV2, PluginRisk } from "./plugin-descriptor-v2.ts";
import { defaultPluginSettings, normalizePluginSettings } from "./plugin-settings-schema.ts";

export const pluginPolicySchemaVersion = 1 as const;
const RISK_ORDER: readonly PluginRisk[] = ["green", "yellow", "orange", "red"];
const RISK_INDEX = new Map<PluginRisk, number>(RISK_ORDER.map((value, index) => [value, index]));

export type PolicyDecisionSource = "global" | "team" | "blocked";

export type PluginPolicyOverrides = {
  enabled?: boolean;
  maxRisk?: PluginRisk;
  capabilities?: readonly string[];
  actions?: readonly string[];
  settings?: Record<string, unknown>;
};

export type TeamPluginPolicy = {
  teamId: string;
  pluginId: string;
  overrides: PluginPolicyOverrides;
};

export type PluginPolicyStore = {
  pluginPolicySchemaVersion: number;
  globalPluginPolicy: Record<string, PluginPolicyOverrides>;
  teamPluginPolicies: TeamPluginPolicy[];
  policyWarnings?: string[];
  lastValidatedAt?: string;
};

export type ResolvedPolicySource = {
  enabled: PolicyDecisionSource;
  maxRisk: PolicyDecisionSource;
  capabilities: PolicyDecisionSource;
  actions: PolicyDecisionSource;
  settings: Record<string, PolicyDecisionSource>;
};

export type ResolvedPluginPolicy = {
  pluginId: string;
  enabled: boolean;
  maxRisk: PluginRisk;
  capabilities: string[];
  actions: string[];
  settings: Record<string, unknown>;
  source: ResolvedPolicySource;
  blockedReasons: string[];
};

type ParseResult = { ok: boolean; state: PluginPolicyStore; warnings: string[] };

const MAX_SETTINGS_DEPTH = 8;

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

  const globalPluginPolicy: Record<string, PluginPolicyOverrides> = {};
  if (input.globalPluginPolicy && typeof input.globalPluginPolicy === "object" && !Array.isArray(input.globalPluginPolicy)) {
    for (const [pluginId, record] of Object.entries(input.globalPluginPolicy)) {
      if (!knownIds.has(pluginId)) continue;
      const parsed = parseOverrides(record);
      if (parsed) globalPluginPolicy[pluginId] = parsed;
    }
  }

  const teamPluginPolicies: TeamPluginPolicy[] = [];
  if (Array.isArray(input.teamPluginPolicies)) {
    for (const entry of input.teamPluginPolicies) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const item = entry as Record<string, unknown>;
      const teamId = typeof item.teamId === "string" ? item.teamId.trim() : "";
      const pluginId = typeof item.pluginId === "string" ? item.pluginId.trim() : "";
      const overrides = parseOverrides(item.overrides);
      if (!teamId || !knownIds.has(pluginId) || !overrides) continue;
      teamPluginPolicies.push({ teamId, pluginId, overrides });
    }
  }

  return {
    ok: warnings.length === 0,
    warnings,
    state: {
      pluginPolicySchemaVersion: version,
      globalPluginPolicy,
      teamPluginPolicies,
      policyWarnings: Array.isArray(input.policyWarnings)
        ? input.policyWarnings.filter((item): item is string => typeof item === "string")
        : undefined,
      lastValidatedAt: typeof input.lastValidatedAt === "string" ? input.lastValidatedAt : new Date().toISOString()
    }
  };
}

export function resolveTeamPolicies(state: PluginPolicyStore, descriptors: readonly PluginDescriptorV2[], teamId: string): Map<string, ResolvedPluginPolicy> {
  const out = new Map<string, ResolvedPluginPolicy>();
  for (const descriptor of descriptors) {
    out.set(descriptor.id, resolveEffectivePluginPolicy(descriptor, state, teamId));
  }
  return out;
}

export function resolveEffectivePluginPolicy(descriptor: PluginDescriptorV2, state: PluginPolicyStore, teamId?: string): ResolvedPluginPolicy {
  const source: ResolvedPolicySource = {
    enabled: "global",
    maxRisk: "global",
    capabilities: "global",
    actions: "global",
    settings: {}
  };
  const blockedReasons: string[] = [];

  const defaultPolicy = descriptor.defaultPolicy;
  const global = state.globalPluginPolicy[descriptor.id] ?? {};
  const team = pickTeamOverride(state.teamPluginPolicies, descriptor.id, teamId);
  const defaults = defaultPluginSettings(descriptor.settingsSchema) as Record<string, unknown>;

  const effectiveEnabled = resolveBooleanPolicy("enabled", defaultPolicy.enabled, global.enabled, team.enabled, source, blockedReasons);
  const effectiveRisk = resolveRiskPolicy(defaultPolicy.maxRisk, global.maxRisk, team.maxRisk, source, blockedReasons);
  const effectiveCapabilities = resolveArrayPolicy("capabilities", defaultPolicy.capabilities, global.capabilities, team.capabilities, source, blockedReasons);
  const effectiveActions = resolveArrayPolicy("actions", defaultPolicy.actions, global.actions, team.actions, source, blockedReasons);
  const effectiveSettings = resolveSettingsPolicy(
    descriptor.settingsSchema,
    defaults,
    global.settings ?? {},
    team.settings ?? {},
    source.settings,
    blockedReasons
  );

  return {
    pluginId: descriptor.id,
    enabled: effectiveEnabled,
    maxRisk: effectiveRisk,
    capabilities: effectiveCapabilities,
    actions: effectiveActions,
    settings: effectiveSettings,
    source,
    blockedReasons: [...new Set(blockedReasons)]
  };
}

type PolicyActionCheck = { requiredCapabilities: readonly string[]; risk: PluginRisk };
export function resolveActionPermission(action: PolicyActionCheck, policy: ResolvedPluginPolicy): { ok: boolean; code?: string } {
  if (!policy.enabled) return { ok: false, code: "plugin_disabled" };
  if (RISK_INDEX.get(action.risk) === undefined) return { ok: false, code: "plugin_risk_violation" };
  if (RISK_INDEX.get(action.risk)! > RISK_INDEX.get(policy.maxRisk)!) return { ok: false, code: "plugin_risk_violation" };
  const missing = action.requiredCapabilities.filter((capability) => !policy.capabilities.includes(capability));
  if (missing.length) return { ok: false, code: "plugin_capability_violation" };
  return { ok: true };
}

export function resolvePluginActionRole(action: { requiredRole: "member" | "manager" | "admin" }, role: "member" | "manager" | "admin", allowManager = false): boolean {
  if (action.requiredRole === "member") return true;
  if (action.requiredRole === "admin") return role === "admin";
  return role === "admin" || (allowManager && role === "manager");
}

function parseOverrides(raw: unknown): PluginPolicyOverrides | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const out: PluginPolicyOverrides = {};
  if (typeof input.enabled === "boolean") out.enabled = input.enabled;
  if (typeof input.maxRisk === "string" && RISK_INDEX.has(input.maxRisk as PluginRisk)) out.maxRisk = input.maxRisk as PluginRisk;
  if (Array.isArray(input.capabilities)) out.capabilities = input.capabilities.filter((item): item is string => typeof item === "string");
  if (Array.isArray(input.actions)) out.actions = input.actions.filter((item): item is string => typeof item === "string");
  if (input.settings && typeof input.settings === "object" && !Array.isArray(input.settings)) out.settings = { ...input.settings };
  return out;
}

function pickTeamOverride(policies: readonly TeamPluginPolicy[], pluginId: string, teamId?: string): PluginPolicyOverrides {
  if (!teamId) return {};
  const item = policies.slice().reverse().find((policy) => policy.teamId === teamId && policy.pluginId === pluginId);
  return item?.overrides ?? {};
}

function resolveBooleanPolicy(
  _field: string,
  defaultValue: boolean,
  global: boolean | undefined,
  team: boolean | undefined,
  source: ResolvedPolicySource,
  blocked: string[]
): boolean {
  const afterGlobal = global === undefined ? defaultValue : global;
  source.enabled = "global";
  if (team === undefined) return afterGlobal;
  if (global === false && team === true) {
    blocked.push("team_disabled");
    source.enabled = "blocked";
    return false;
  }
  source.enabled = "team";
  return team;
}

function resolveRiskPolicy(
  defaultRisk: PluginRisk,
  global: PluginRisk | undefined,
  team: PluginRisk | undefined,
  source: ResolvedPolicySource,
  blocked: string[]
): PluginRisk {
  const effectiveGlobal = isRisk(global) ? global : defaultRisk;
  source.maxRisk = global ? "global" : "global";
  if (!team) return effectiveGlobal;
  if (!isRisk(team)) {
    blocked.push("team_risk_invalid");
    source.maxRisk = "blocked";
    return effectiveGlobal;
  }
  if (RISK_INDEX.get(team)! > RISK_INDEX.get(effectiveGlobal)!) {
    blocked.push("team_risk_exceeds_global");
    source.maxRisk = "blocked";
    return effectiveGlobal;
  }
  source.maxRisk = "team";
  return team;
}

function resolveArrayPolicy(
  field: "capabilities" | "actions",
  defaultValue: readonly string[],
  global: readonly string[] | undefined,
  team: readonly string[] | undefined,
  source: ResolvedPolicySource,
  blocked: string[]
): string[] {
  const afterGlobal = global ? defaultValue.filter((item) => global.includes(item)) : [...defaultValue];
  if (!global && field === "capabilities") source[field] = "global";
  else if (global) source[field] = "global";
  if (!team) return afterGlobal;
  const next = afterGlobal.filter((item) => team.includes(item));
  source[field] = "team";
  if (team.some((item) => !afterGlobal.includes(item))) blocked.push(`team_${field}_exceeds_global`);
  return next;
}

function resolveSettingsPolicy(
  schema: PluginMiniSchema,
  base: Record<string, unknown>,
  global: Record<string, unknown>,
  team: Record<string, unknown>,
  source: Record<string, PolicyDecisionSource>,
  blocked: string[],
  depth = 0,
  path: string[] = []
): Record<string, unknown> {
  if (depth > MAX_SETTINGS_DEPTH) return {};
  if (schema.type !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(schema.properties)) {
    const nextPath = [...path, key];
    const childPath = nextPath.join(".");
    const baseValue = base[key];
    const globalValue = typeof global === "object" ? global[key] : undefined;
    const teamValue = typeof team === "object" ? team[key] : undefined;
    const merged = resolveSettingValue(child, baseValue, globalValue, teamValue, blocked, depth + 1, nextPath);
    source[childPath] = merged.source;
    out[key] = merged.value;
    if (merged.blocked) blocked.push(`${childPath}:${merged.blocked}`);
  }
  return out;
}

function resolveSettingValue(
  schema: PluginMiniSchema,
  base: unknown,
  globalRaw: unknown,
  teamRaw: unknown,
  blocked: string[],
  depth: number,
  path: string[]
): { value: unknown; source: PolicyDecisionSource; blocked?: string } {
  const strategy = schema.restrictiveMerge ?? defaultStrategy(schema.type);
  const pathId = path.join(".");

  const normalizedBase = applySettingValue(schema, base);
  const global = validateAndNormalize(schema, globalRaw);
  const team = validateAndNormalize(schema, teamRaw);
  const afterGlobal = global.ok ? global.value : normalizedBase;
  if (!global.ok && globalRaw !== undefined) blocked.push(`global_invalid_${pathId}`);
  if (strategy === "inheritOnly" || teamRaw === undefined) return { value: afterGlobal, source: global.ok ? "global" : "blocked" };
  if (!team.ok && teamRaw !== undefined) return { value: afterGlobal, source: "blocked", blocked: "team_invalid" };
  if (!team.ok) return { value: afterGlobal, source: global.ok ? "global" : "blocked" };
  if (schema.type === "object") {
    return {
      value: resolveSettingsPolicy(
        schema,
        asRecord(normalizedBase),
        asRecord(afterGlobal),
        asRecord(team.value),
        {},
        blocked,
        depth,
        path
      ),
      source: "team"
    };
  }
  if (schema.type === "boolean" && strategy === "falseWins") {
    if (team.value === false) return { value: false, source: "team" };
    return { value: afterGlobal, source: "global" };
  }
  if (schema.type === "array" && strategy === "intersection") {
    const teamArray = Array.isArray(team.value) ? team.value : [];
    const globalArray = Array.isArray(afterGlobal) ? afterGlobal : [];
    return {
      value: teamArray.filter((item) => globalArray.includes(item)),
      source: "team"
    };
  }
  if (schema.type === "number" || schema.type === "integer") {
    const parent = typeof afterGlobal === "number" ? afterGlobal : (0 as number);
    const value = typeof team.value === "number" ? team.value : parent;
    if (strategy === "minWins") return { value: Math.min(parent, value), source: "team" };
    if (strategy === "maxWins") return { value: Math.max(parent, value), source: "team" };
    if (strategy === "orderedMax") return { value: Math.max(parent, value), source: "team" };
  }
  if (schema.type === "enum" && strategy === "orderedMax") {
    const order = (schema.orderedValues ?? schema.values);
    const parentIndex = order.indexOf(String(afterGlobal));
    const teamIndex = order.indexOf(String(team.value));
    if (parentIndex === -1 || teamIndex === -1) return { value: afterGlobal, source: "blocked", blocked: "enum_out_of_order" };
    return { value: order[Math.min(parentIndex, teamIndex)], source: "team" };
  }
  return { value: team.ok ? team.value : afterGlobal, source: "team" };
}

function defaultStrategy(type: PluginMiniSchema["type"]): PluginSettingMergeStrategy {
  if (type === "boolean") return "falseWins";
  if (type === "array") return "intersection";
  if (type === "integer" || type === "number") return "minWins";
  if (type === "enum") return "orderedMax";
  if (type === "object") return "inheritOnly";
  return "inheritOnly";
}

function applySettingValue(schema: PluginMiniSchema, value: unknown): unknown {
  return normalizePluginSettings(schema, value);
}

function validateAndNormalize(schema: PluginMiniSchema, value: unknown): { ok: boolean; value: unknown } {
  if (value === undefined) return { ok: false, value };
  const result = validatePluginSettings(schema, value);
  if (!result.ok) return { ok: false, value };
  return { ok: true, value: normalizePluginSettings(schema, value) };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function isRisk(value: unknown): value is PluginRisk {
  return typeof value === "string" && RISK_INDEX.has(value as PluginRisk);
}

function emptyPolicyState(): PluginPolicyStore {
  return {
    pluginPolicySchemaVersion,
    globalPluginPolicy: {},
    teamPluginPolicies: [],
    policyWarnings: ["policy-was-missing-or-invalid"]
  };
}
