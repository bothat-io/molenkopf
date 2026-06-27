import type { DashboardData } from "./types";

type Risk = "green" | "yellow" | "orange" | "red";

export type TeamPluginDraft = {
  enabledMode: "inherit" | "override";
  enabled: boolean;
  maxRiskMode: "inherit" | "override";
  maxRisk: Risk;
};

export function buildGlobalPluginPolicyRequest(data: DashboardData, pluginId: string, value: { enabled: boolean; maxRisk: Risk }) {
  const current = data.pluginPolicies?.global?.globalPluginPolicy || {};
  return {
    path: "/__molenkopf/plugin-policies/global",
    body: { globalPluginPolicy: { ...current, [pluginId]: { ...(current[pluginId] || {}), enabled: value.enabled, maxRisk: value.maxRisk } } }
  };
}

export function buildTeamPluginPolicyRequest(data: DashboardData, teamId: string, pluginId: string, value: TeamPluginDraft) {
  const current = data.pluginPolicies?.teams?.[teamId]?.pluginPolicies || {};
  const nextOverride: Record<string, unknown> = {};
  if (value.enabledMode === "override") nextOverride.enabled = value.enabled;
  if (value.maxRiskMode === "override") nextOverride.maxRisk = value.maxRisk;
  const pluginPolicies = { ...current, [pluginId]: nextOverride };
  if (!Object.keys(nextOverride).length) delete pluginPolicies[pluginId];
  return { path: `/__molenkopf/plugin-policies/teams/${teamId}`, body: { pluginPolicies } };
}

export function buildResetTeamPluginPolicyRequest(data: DashboardData, teamId: string, pluginId: string) {
  const pluginPolicies = { ...(data.pluginPolicies?.teams?.[teamId]?.pluginPolicies || {}) };
  delete pluginPolicies[pluginId];
  return { path: `/__molenkopf/plugin-policies/teams/${teamId}`, body: { pluginPolicies } };
}
