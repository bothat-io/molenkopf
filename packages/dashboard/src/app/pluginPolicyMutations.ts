import type { DashboardData } from "./types";

type Risk = "green" | "yellow" | "orange" | "red";
type PolicyDetails = { capabilities: string[]; actions: string[]; settings: Record<string, unknown> };

export type TeamPluginDraft = {
  enabledMode: "inherit" | "override";
  enabled: boolean;
  maxRiskMode: "inherit" | "override";
  maxRisk: Risk;
  capabilitiesMode: "inherit" | "override";
  actionsMode: "inherit" | "override";
  settingsMode: "inherit" | "override";
} & PolicyDetails;

export type GlobalPluginDraft = {
  enabled: boolean;
  maxRisk: Risk;
} & PolicyDetails;

export function buildGlobalPluginPolicyRequest(data: DashboardData, pluginId: string, value: GlobalPluginDraft) {
  const current = data.pluginPolicies?.global?.globalPluginPolicy || {};
  const override = {
    ...(current[pluginId] || {}),
    enabled: value.enabled,
    maxRisk: value.maxRisk,
    capabilities: value.capabilities,
    actions: value.actions,
    settings: value.settings
  };
  return {
    path: "/__molenkopf/plugin-policies/global",
    body: { globalPluginPolicy: { ...current, [pluginId]: override } }
  };
}

export function buildTeamPluginPolicyRequest(data: DashboardData, teamId: string, pluginId: string, value: TeamPluginDraft) {
  const current = data.pluginPolicies?.teams?.[teamId]?.pluginPolicies || {};
  const nextOverride: Record<string, unknown> = {};
  if (value.enabledMode === "override") nextOverride.enabled = value.enabled;
  if (value.maxRiskMode === "override") nextOverride.maxRisk = value.maxRisk;
  if (value.capabilitiesMode === "override") nextOverride.capabilities = value.capabilities;
  if (value.actionsMode === "override") nextOverride.actions = value.actions;
  if (value.settingsMode === "override") nextOverride.settings = value.settings;
  const pluginPolicies = { ...current, [pluginId]: nextOverride };
  if (!Object.keys(nextOverride).length) delete pluginPolicies[pluginId];
  return { path: `/__molenkopf/plugin-policies/teams/${teamId}`, body: { pluginPolicies } };
}

export function buildResetTeamPluginPolicyRequest(data: DashboardData, teamId: string, pluginId: string) {
  const pluginPolicies = { ...(data.pluginPolicies?.teams?.[teamId]?.pluginPolicies || {}) };
  delete pluginPolicies[pluginId];
  return { path: `/__molenkopf/plugin-policies/teams/${teamId}`, body: { pluginPolicies } };
}
