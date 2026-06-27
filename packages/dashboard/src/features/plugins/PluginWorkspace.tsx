import { useMemo, useState } from "react";
import { IconButton } from "../../components/actions/IconButton";
import { ActionGroup } from "../../components/actions/ActionGroup";
import { CollapsibleGroup, CollapsiblePanel } from "../../components/data/CollapsibleGroup";
import { DashboardSection } from "../../components/layout/DashboardSection";
import { num } from "../../app/format";
import type { DashboardData, PluginView, TeamView } from "../../app/types";
import { GlobalPluginSettingsForm, TeamPluginSettingsForm } from "./PluginSettingsForm";
import "./PluginPanels.css";

type Risk = "green" | "yellow" | "orange" | "red";
type TeamDraft = { enabledMode: "inherit" | "override"; enabled: boolean; maxRiskMode: "inherit" | "override"; maxRisk: Risk };

export function PluginWorkspace(props: {
  data: DashboardData;
  teams: TeamView[];
  onPluginToggle: (id: string, enabled: boolean) => void;
  onSaveGlobalPluginPolicy: (pluginId: string, value: { enabled: boolean; maxRisk: Risk }) => Promise<void> | void;
  onSaveTeamPluginPolicy: (teamId: string, pluginId: string, value: TeamDraft) => Promise<void> | void;
  onResetTeamPluginPolicy: (teamId: string, pluginId: string) => Promise<void> | void;
}) {
  const items = useMemo(() => [...(props.data.plugins.items || [])].sort((a, b) => a.name.localeCompare(b.name)), [props.data.plugins.items]);
  const [scope, setScope] = useState("global");
  const team = props.teams.find((item) => item.id === scope);
  return <DashboardSection title="Plugins" actions={<ScopeSelect scope={scope} teams={props.teams} onChange={setScope} />}>
    <CollapsiblePanel className="plugin-admin-stack">
      {items.map((plugin) => <PluginRow key={plugin.id} plugin={plugin} data={props.data} team={team} onPluginToggle={props.onPluginToggle} onSaveGlobalPluginPolicy={props.onSaveGlobalPluginPolicy} onSaveTeamPluginPolicy={props.onSaveTeamPluginPolicy} onResetTeamPluginPolicy={props.onResetTeamPluginPolicy} />)}
    </CollapsiblePanel>
  </DashboardSection>;
}

function PluginRow(props: { plugin: PluginView; data: DashboardData; team?: TeamView; onPluginToggle: (id: string, enabled: boolean) => void; onSaveGlobalPluginPolicy: (pluginId: string, value: { enabled: boolean; maxRisk: Risk }) => Promise<void> | void; onSaveTeamPluginPolicy: (teamId: string, pluginId: string, value: TeamDraft) => Promise<void> | void; onResetTeamPluginPolicy: (teamId: string, pluginId: string) => Promise<void> | void; }) {
  const { plugin, data, team } = props;
  const globalPolicy = data.pluginPolicies?.global?.globalPluginPolicy?.[plugin.id] || {};
  const teamPolicy = team ? data.pluginPolicies?.teams?.[team.id]?.pluginPolicies?.[plugin.id] || {} : {};
  const effective = team ? data.pluginPolicies?.effective?.[team.id]?.policies?.[plugin.id] : undefined;
  const enabled = plugin.enabled !== false;
  const metric = plugin.id === "context-compressor-plugin" ? `${num(data.summary.savedTokens)} tokens saved` : plugin.category || "";
  const capabilities = effective?.policy.capabilities || globalPolicy.capabilities || plugin.permissions || [];
  return <CollapsibleGroup
    title={plugin.name}
    subtitle={plugin.description || plugin.category}
    open={false}
    onToggle={() => {}}
    metrics={[
      { key: "status", content: <span className={`pill${enabled ? "" : " off"}`}>{plugin.lifecycleStatus || (enabled ? "enabled" : "disabled")}</span> },
      { key: "type", content: plugin.type || plugin.category || "plugin" },
      { key: "effect", content: plugin.traffic?.mutates?.join(", ") || "none" },
      { key: "metric", content: metric || "none" }
    ]}
    actions={<PluginActions plugin={plugin} onToggle={props.onPluginToggle} />}
  >
    <div className="plugin-panel-stack">
      <div className="plugin-panel-summary">
        <div className="plugin-kv"><b>Editing scope</b><span>{team ? team.name : "Global default"}</span><small>{team ? "Override or inherit from global." : "Default policy for all teams."}</small></div>
        <div className="plugin-kv"><b>Effective enabled</b><span>{team ? (effective?.policy.enabled ? "Yes" : "No") : (globalPolicy.enabled ?? enabled ? "Yes" : "No")}</span><small>{team ? (effective?.teamOverrideExists ? "Team override active." : "Inherited from global.") : "Seed for team inheritance."}</small></div>
        <div className="plugin-kv"><b>Max risk</b><span>{team ? effective?.policy.maxRisk || "green" : globalPolicy.maxRisk || "green"}</span><small>{team ? "Resolved after team restriction." : "Upper bound for all teams."}</small></div>
        <div className="plugin-kv"><b>Blocked reasons</b><span>{team ? (effective?.policy.blockedReasons || []).join(", ") || "none" : "none"}</span><small>{team ? "Why effective policy may still block runtime use." : "Evaluated per team at runtime."}</small></div>
      </div>
      <div><div className="label"><span>Capabilities</span></div><div className="plugin-tag-list">{capabilities.length ? capabilities.map((item) => <span key={item} className="plugin-tag">{item}</span>) : <span className="plugin-tag">none</span>}</div></div>
      <div className="plugin-panel-form">
        <h4>{team ? `${team.name} override` : "Global defaults"}</h4>
        <p>{team ? "Choose inherit or override for this team." : "Change the global default policy for this plugin."}</p>
        {team ? <TeamPluginSettingsForm draft={{ enabledMode: teamPolicy.enabled === undefined ? "inherit" : "override", enabled: Boolean(teamPolicy.enabled ?? effective?.policy.enabled ?? true), maxRiskMode: teamPolicy.maxRisk === undefined ? "inherit" : "override", maxRisk: (teamPolicy.maxRisk as Risk) || (effective?.policy.maxRisk as Risk) || "green" }} onSave={(value) => props.onSaveTeamPluginPolicy(team.id, plugin.id, value)} onReset={() => props.onResetTeamPluginPolicy(team.id, plugin.id)} /> : <GlobalPluginSettingsForm enabled={Boolean(globalPolicy.enabled ?? enabled)} maxRisk={(globalPolicy.maxRisk as Risk) || "green"} onSave={(value) => props.onSaveGlobalPluginPolicy(plugin.id, value)} />}
      </div>
    </div>
  </CollapsibleGroup>;
}

function PluginActions({ plugin, onToggle }: { plugin: PluginView; onToggle: (id: string, enabled: boolean) => void }) {
  const enabled = plugin.enabled !== false;
  return <ActionGroup>{isSafePluginPagePath(plugin.pagePath) ? <IconButton icon="open" label="Open plugin page" onClick={() => window.open(plugin.pagePath, "_blank", "noopener,noreferrer")} /> : null}{plugin.canToggle ? <button type="button" className={`plugin-toggle ${enabled ? "is-on" : "is-off"}`} aria-pressed={enabled} onClick={() => onToggle(plugin.id, !enabled)}><span className="plugin-toggle-dot" />{enabled ? "Turn off" : "Turn on"}</button> : null}</ActionGroup>;
}

function ScopeSelect({ scope, teams, onChange }: { scope: string; teams: TeamView[]; onChange: (value: string) => void }) {
  return <label className="plugin-scope-select"><span>Editing scope</span><select value={scope} onChange={(event) => onChange(event.currentTarget.value)}><option value="global">Global default</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name || team.id}</option>)}</select></label>;
}

function isSafePluginPagePath(path: string | undefined): path is string {
  return typeof path === "string" && /^\/__molenkopf\/plugins\/[a-z0-9-]+\/page$/.test(path);
}
