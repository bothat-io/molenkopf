import { CollapsibleGroup } from "../../components/data/CollapsibleGroup";
import { DashboardSection } from "../../components/layout/DashboardSection";
import type { GlobalPluginPolicyView, PluginState } from "../../app/types";
import { GlobalPluginSettingsForm } from "./PluginSettingsForm";

export function PluginRegistryPanel({
  plugins, globalPolicy, onSave
}: {
  plugins: PluginState;
  globalPolicy?: GlobalPluginPolicyView;
  onSave?: (pluginId: string, value: { enabled: boolean; maxRisk: "green" | "yellow" | "orange" | "red" }) => Promise<void> | void;
}) {
  const items = [...(plugins.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  return <DashboardSection title="Global Plugin Registry">
    {items.map((plugin) => {
      const policy = globalPolicy?.globalPluginPolicy?.[plugin.id] || {};
      return <CollapsibleGroup key={plugin.id} title={plugin.name} subtitle={plugin.description || plugin.category} open={true} onToggle={() => {}}>
        <div className="plugin-policy-grid">
          <p>Global availability: {plugin.enabled === false ? "disabled" : "enabled"}</p>
          <p>Default enabled: {policy.enabled ?? plugin.enabled ?? true ? "yes" : "no"}</p>
          <p>Global max risk: {policy.maxRisk || "green"}</p>
          <p>Capabilities: {(policy.capabilities || plugin.permissions || []).join(", ") || "none"}</p>
          <p>Actions: {(policy.actions || []).join(", ") || "none"}</p>
        </div>
        {onSave ? <GlobalPluginSettingsForm
          enabled={Boolean(policy.enabled ?? plugin.enabled ?? true)}
          maxRisk={(policy.maxRisk as "green" | "yellow" | "orange" | "red") || "green"}
          onSave={(value) => onSave(plugin.id, value)}
        /> : null}
      </CollapsibleGroup>;
    })}
  </DashboardSection>;
}
