import { CollapsibleGroup } from "../../components/data/CollapsibleGroup";
import { DashboardSection } from "../../components/layout/DashboardSection";
import type { EffectivePluginPolicyView, PluginState, TeamPluginPolicyView, TeamView } from "../../app/types";
import { TeamPluginSettingsForm } from "./PluginSettingsForm";

export function TeamPluginSettings({
  team, plugins, teamPolicy, effectivePolicy, onSave, onReset
}: {
  team?: TeamView;
  plugins: PluginState;
  teamPolicy?: TeamPluginPolicyView;
  effectivePolicy?: EffectivePluginPolicyView;
  onSave?: (pluginId: string, value: { enabledMode: "inherit" | "override"; enabled: boolean; maxRiskMode: "inherit" | "override"; maxRisk: "green" | "yellow" | "orange" | "red" }) => Promise<void> | void;
  onReset?: (pluginId: string) => Promise<void> | void;
}) {
  const items = [...(plugins.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  return <DashboardSection title="Team Plugin Settings">
    <p>{team ? `Selected team: ${team.name || team.id}` : "No team selected"}</p>
    {items.map((plugin) => {
      const override = teamPolicy?.pluginPolicies?.[plugin.id] || {};
      const effective = effectivePolicy?.policies?.[plugin.id];
      return <CollapsibleGroup key={plugin.id} title={plugin.name} subtitle={effective?.teamOverrideExists ? "Overridden by team" : "Inherited from global"} open={true} onToggle={() => {}}>
        <div className="plugin-policy-grid">
          <p>Enabled mode: {override.enabled === undefined ? "inherit" : "override"}</p>
          <p>Effective enabled: {effective?.policy.enabled ? "yes" : "no"}</p>
          <p>Risk mode: {override.maxRisk === undefined ? "inherit" : "override"}</p>
          <p>Effective max risk: {effective?.policy.maxRisk || "green"}</p>
          <p>Source: {effective?.teamOverrideExists ? "Overridden by team" : "Inherited from global"}</p>
          <p>Blocked reasons: {(effective?.policy.blockedReasons || []).join(", ") || "none"}</p>
        </div>
        {onSave && onReset ? <TeamPluginSettingsForm
          draft={{
            enabledMode: override.enabled === undefined ? "inherit" : "override",
            enabled: Boolean(override.enabled ?? effective?.policy.enabled ?? true),
            maxRiskMode: override.maxRisk === undefined ? "inherit" : "override",
            maxRisk: (override.maxRisk as "green" | "yellow" | "orange" | "red") || (effective?.policy.maxRisk as "green" | "yellow" | "orange" | "red") || "green"
          }}
          onSave={(value) => onSave(plugin.id, value)}
          onReset={() => onReset(plugin.id)}
        /> : null}
      </CollapsibleGroup>;
    })}
  </DashboardSection>;
}
