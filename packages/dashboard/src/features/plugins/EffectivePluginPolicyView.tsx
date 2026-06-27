import { DashboardSection } from "../../components/layout/DashboardSection";
import type { EffectivePluginPolicyView as EffectivePolicy } from "../../app/types";

export function EffectivePluginPolicyView({ effective }: { effective?: EffectivePolicy }) {
  const items = Object.values(effective?.policies || {}).sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  return <DashboardSection title="Effective Plugin Policy">
    {items.length ? items.map((item) => <div key={item.pluginId} className="policy-row">
      <strong>{item.pluginId}</strong>
      <p>Enabled: {item.policy.enabled ? "yes" : "no"}</p>
      <p>Max risk: {item.policy.maxRisk}</p>
      <p>Capabilities: {item.policy.capabilities.join(", ") || "none"}</p>
      <p>Blocked reasons: {item.policy.blockedReasons.join(", ") || "none"}</p>
    </div>) : <p>No effective policy loaded.</p>}
  </DashboardSection>;
}
