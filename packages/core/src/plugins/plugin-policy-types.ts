import type { PluginDescriptorV2, PluginRisk } from "./plugin-descriptor-v2.ts";

export const pluginPolicySchemaVersion = 1 as const;
export const RISK_ORDER: readonly PluginRisk[] = ["green", "yellow", "orange", "red"];
export const RISK_INDEX = new Map<PluginRisk, number>(RISK_ORDER.map((value, index) => [value, index]));

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

export type ParseResult = { ok: boolean; state: PluginPolicyStore; warnings: string[] };
export type PolicyActionCheck = { requiredCapabilities: readonly string[]; risk: PluginRisk };
export type RoleCheck = { requiredRole: "member" | "manager" | "admin" };
export type SettingsContext = {
  descriptors: readonly PluginDescriptorV2[];
  state: PluginPolicyStore;
  teamId?: string;
};

export function emptyPolicyState(): PluginPolicyStore {
  return {
    pluginPolicySchemaVersion,
    globalPluginPolicy: {},
    teamPluginPolicies: [],
    policyWarnings: ["policy-was-missing-or-invalid"]
  };
}

export function isRisk(value: unknown): value is PluginRisk {
  return typeof value === "string" && RISK_INDEX.has(value as PluginRisk);
}
