import type { PluginView } from "../../app/types";
import type { TeamDraft } from "./PluginSettingsForm";
import { pluginActionLabels } from "./PluginWorkspaceMeta";

type Risk = "green" | "yellow" | "orange" | "red";
type Policy = {
  enabled?: boolean;
  maxRisk?: string;
  capabilities?: string[];
  actions?: string[];
  settings?: Record<string, unknown>;
};
type EffectivePolicy = { policy: Required<Pick<Policy, "capabilities" | "actions" | "settings">> & { enabled: boolean; maxRisk: string } };

export function pluginDefaultMaxRisk(plugin: PluginView): Risk {
  return riskValue(plugin.defaultMaxRisk) || maxActionRisk(plugin) || "green";
}

export function riskValue(value: unknown): Risk | undefined {
  return value === "green" || value === "yellow" || value === "orange" || value === "red" ? value : undefined;
}

export function policySettings(value: Record<string, unknown> | undefined, plugin: PluginView): Record<string, unknown> {
  if (value) return value;
  const schema = plugin.settingsSchema;
  if (schema?.type !== "object" || !schema.properties) return {};
  return Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, child.default]));
}

export function pluginPolicyOptions(plugin: PluginView) {
  return {
    availableCapabilities: plugin.capabilities || plugin.permissions || [],
    availableActions: pluginActionLabels(plugin),
    settingsSchema: plugin.settingsSchema
  };
}

export function teamPluginDraft(input: {
  teamPolicy: Policy;
  effective?: EffectivePolicy;
  globalMaxRisk: Risk;
  availableCapabilities: string[];
  availableActions: string[];
  effectiveSettings: Record<string, unknown>;
}): TeamDraft {
  const { teamPolicy, effective, globalMaxRisk, availableCapabilities, availableActions, effectiveSettings } = input;
  return {
    enabledMode: teamPolicy.enabled === undefined ? "inherit" : "override",
    enabled: Boolean(teamPolicy.enabled ?? effective?.policy.enabled ?? true),
    maxRiskMode: teamPolicy.maxRisk === undefined ? "inherit" : "override",
    maxRisk: riskValue(teamPolicy.maxRisk) || riskValue(effective?.policy.maxRisk) || globalMaxRisk,
    capabilitiesMode: teamPolicy.capabilities === undefined ? "inherit" : "override",
    capabilities: teamPolicy.capabilities || effective?.policy.capabilities || availableCapabilities,
    actionsMode: teamPolicy.actions === undefined ? "inherit" : "override",
    actions: teamPolicy.actions || effective?.policy.actions || availableActions,
    settingsMode: teamPolicy.settings === undefined ? "inherit" : "override",
    settings: teamPolicy.settings || effectiveSettings
  };
}

function maxActionRisk(plugin: PluginView): Risk | undefined {
  const order: Risk[] = ["green", "yellow", "orange", "red"];
  let max = -1;
  for (const action of plugin.actions || []) max = Math.max(max, order.indexOf(action.risk as Risk));
  return max >= 0 ? order[max] : undefined;
}
