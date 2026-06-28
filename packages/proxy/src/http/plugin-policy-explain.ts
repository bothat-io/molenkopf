import type { PluginPolicyStore, ResolvedPluginPolicy } from "../../../core/src/plugins/plugin-policy.ts";
import { resolveTeamPolicies } from "../../../core/src/plugins/plugin-policy.ts";
import { builtinPluginDescriptorV2 } from "./plugin-platform.ts";

export type EffectivePolicyView = {
  teamId: string;
  policies: Record<string, EffectivePolicyViewItem>;
};

export type EffectivePolicyViewItem = {
  pluginId: string;
  globalOverrideExists: boolean;
  teamOverrideExists: boolean;
  policy: ResolvedPluginPolicy;
};

export function explainEffectivePolicies(state: PluginPolicyStore, teamId: string): EffectivePolicyView {
  const policies = resolveTeamPolicies(state, builtinPluginDescriptorV2(), teamId);
  return {
    teamId,
    policies: Object.fromEntries([...policies].map(([pluginId, policy]) => [
      pluginId,
      {
        pluginId,
        globalOverrideExists: Boolean(state.globalPluginPolicy[pluginId]),
        teamOverrideExists: state.teamPluginPolicies.some((item) => item.teamId === teamId && item.pluginId === pluginId),
        policy
      } satisfies EffectivePolicyViewItem
    ]))
  };
}

export function explainEffectivePolicyForPlugin(
  state: PluginPolicyStore,
  teamId: string,
  pluginId: string
): EffectivePolicyViewItem | undefined {
  return explainEffectivePolicies(state, teamId).policies[pluginId];
}
