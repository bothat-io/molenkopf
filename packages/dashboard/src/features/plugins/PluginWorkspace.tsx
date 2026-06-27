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
  const items = useMemo(
    () => [...(props.data.plugins.items || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [props.data.plugins.items]
  );
  const [scope, setScope] = useState("global");
  const team = props.teams.find((item) => item.id === scope);
  return <DashboardSection title="Plugins" actions={<ScopeSelect scope={scope} teams={props.teams} onChange={setScope} />}>
    <CollapsiblePanel className="plugin-admin-stack">
      {items.map((plugin) => <PluginRow
        key={plugin.id}
        plugin={plugin}
        data={props.data}
        team={team}
        onPluginToggle={props.onPluginToggle}
        onSaveGlobalPluginPolicy={props.onSaveGlobalPluginPolicy}
        onSaveTeamPluginPolicy={props.onSaveTeamPluginPolicy}
        onResetTeamPluginPolicy={props.onResetTeamPluginPolicy}
      />)}
    </CollapsiblePanel>
  </DashboardSection>;
}

function PluginRow(props: {
  plugin: PluginView;
  data: DashboardData;
  team?: TeamView;
  onPluginToggle: (id: string, enabled: boolean) => void;
  onSaveGlobalPluginPolicy: (pluginId: string, value: { enabled: boolean; maxRisk: Risk }) => Promise<void> | void;
  onSaveTeamPluginPolicy: (teamId: string, pluginId: string, value: TeamDraft) => Promise<void> | void;
  onResetTeamPluginPolicy: (teamId: string, pluginId: string) => Promise<void> | void;
}) {
  const { plugin, data, team } = props;
  const globalPolicy = data.pluginPolicies?.global?.globalPluginPolicy?.[plugin.id] || {};
  const teamPolicy = team ? data.pluginPolicies?.teams?.[team.id]?.pluginPolicies?.[plugin.id] || {} : {};
  const effective = team ? data.pluginPolicies?.effective?.[team.id]?.policies?.[plugin.id] : undefined;
  const enabled = plugin.enabled !== false;
  const metric = pluginMetric(plugin.id, data.summary.savedTokens, plugin.category);
  const capabilities = effective?.policy.capabilities || globalPolicy.capabilities || plugin.permissions || [];
  const blockedReasons = team ? effective?.policy.blockedReasons || [] : [];
  const sourceLabel = team ? (effective?.teamOverrideExists ? "Team override active" : "Inherited from global") : "Global default";
  return <CollapsibleGroup
    title={plugin.name}
    subtitle={plugin.description || plugin.category}
    open={false}
    onToggle={() => {}}
    bodyClassName="plugin-body"
    summaryClassName="plugin-summary"
    metrics={[
      { key: "status", label: "Status", value: <span className={`pill${enabled ? "" : " off"}`}>{plugin.lifecycleStatus || (enabled ? "enabled" : "disabled")}</span> },
      { key: "type", label: "Type", value: plugin.type || plugin.category || "plugin" },
      { key: "effect", label: "Effect", value: pluginEffect(plugin) },
      { key: "metric", label: "Metric", value: metric || "none" }
    ]}
    actions={<PluginActions plugin={plugin} onToggle={props.onPluginToggle} />}
  >
    <div className="plugin-panel-stack">
      <div className="plugin-panel-summary">
        <InfoCard
          title="Scope"
          value={team ? team.name : "Global default"}
          note={team ? "Override or inherit per field." : "Default policy for all teams."}
        />
        <InfoCard
          title="Policy source"
          value={sourceLabel}
          note={team ? "Unset team fields inherit global." : "Descriptor defaults only seed missing persisted policy."}
        />
        <InfoCard
          title="Effective enabled"
          value={team ? (effective?.policy.enabled ? "Yes" : "No") : (globalPolicy.enabled ?? enabled ? "Yes" : "No")}
          note={team ? "Resolved from global plus team restriction." : "Used as the global default."}
        />
        <InfoCard
          title="Max risk"
          value={team ? effective?.policy.maxRisk || "green" : globalPolicy.maxRisk || "green"}
          note={team ? "Team can only stay within the global bound." : "Upper bound for all teams."}
        />
      </div>
      <div className="plugin-panel-sections">
        <div className="plugin-panel-block">
          <div className="plugin-panel-heading">
            <h4>Capabilities</h4>
            <p>Effective capabilities available to this scope.</p>
          </div>
          <div className="plugin-tag-list">
            {capabilities.length
              ? capabilities.map((item) => <span key={item} className="plugin-tag">{item}</span>)
              : <span className="plugin-tag">none</span>}
          </div>
        </div>
        <div className="plugin-panel-block">
          <div className="plugin-panel-heading">
            <h4>Runtime state</h4>
            <p>Why the plugin is active, inherited, or restricted.</p>
          </div>
          <div className="plugin-tag-list">
            <span className="plugin-tag soft">{team ? `Source: ${sourceLabel}` : "Source: Global default"}</span>
            {(blockedReasons.length ? blockedReasons : ["none"]).map((item) => <span
              key={item}
              className={`plugin-tag${item === "none" ? "" : " warn"}`}
            >{item === "none" ? "No runtime blocks" : item}</span>)}
          </div>
        </div>
      </div>
      <div className="plugin-panel-form">
        <div className="plugin-panel-heading">
          <h4>{team ? `${team.name} settings` : "Global defaults"}</h4>
          <p>{team ? "Edit team overrides here. Plugin pages stay separate and only show plugin data." : "Edit the global plugin default policy here."}</p>
        </div>
        {team ? <TeamPluginSettingsForm
          draft={{
            enabledMode: teamPolicy.enabled === undefined ? "inherit" : "override",
            enabled: Boolean(teamPolicy.enabled ?? effective?.policy.enabled ?? true),
            maxRiskMode: teamPolicy.maxRisk === undefined ? "inherit" : "override",
            maxRisk: (teamPolicy.maxRisk as Risk) || (effective?.policy.maxRisk as Risk) || "green"
          }}
          onSave={(value) => props.onSaveTeamPluginPolicy(team.id, plugin.id, value)}
          onReset={() => props.onResetTeamPluginPolicy(team.id, plugin.id)}
        /> : <GlobalPluginSettingsForm
          enabled={Boolean(globalPolicy.enabled ?? enabled)}
          maxRisk={(globalPolicy.maxRisk as Risk) || "green"}
          onSave={(value) => props.onSaveGlobalPluginPolicy(plugin.id, value)}
        />}
        <div className="plugin-inline-note">
          {team
            ? "Changing one field does not mirror the whole global policy. Unset fields continue to inherit."
            : "Teams inherit these defaults unless they add a more restrictive override."}
        </div>
      </div>
    </div>
  </CollapsibleGroup>;
}

function PluginActions({ plugin, onToggle }: { plugin: PluginView; onToggle: (id: string, enabled: boolean) => void }) {
  const enabled = plugin.enabled !== false;
  return <ActionGroup>
    {isSafePluginPagePath(plugin.pagePath)
      ? <IconButton icon="open" label="Open plugin page" onClick={() => window.open(plugin.pagePath, "_blank", "noopener,noreferrer")} />
      : null}
    {plugin.canToggle ? <button
      type="button"
      className={`plugin-toggle ${enabled ? "is-on" : "is-off"}`}
      aria-pressed={enabled}
      onClick={() => onToggle(plugin.id, !enabled)}
    ><span className="plugin-toggle-dot" />{enabled ? "Turn off" : "Turn on"}</button> : null}
  </ActionGroup>;
}

function ScopeSelect({ scope, teams, onChange }: { scope: string; teams: TeamView[]; onChange: (value: string) => void }) {
  return <label className="plugin-scope-select">
    <span>Scope</span>
    <select value={scope} onChange={(event) => onChange(event.currentTarget.value)}>
      <option value="global">Global default</option>
      {teams.map((team) => <option key={team.id} value={team.id}>{team.name || team.id}</option>)}
    </select>
  </label>;
}

function isSafePluginPagePath(path: string | undefined): path is string {
  return typeof path === "string" && /^\/__molenkopf\/plugins\/[a-z0-9-]+\/page$/.test(path);
}

function InfoCard({ title, value, note }: { title: string; value: string; note: string }) {
  return <div className="plugin-kv"><b>{title}</b><span>{value}</span><small>{note}</small></div>;
}

function pluginEffect(plugin: PluginView): string {
  const effects = plugin.traffic?.mutates?.filter((item) => item && item !== "none") || [];
  return effects.length ? effects.join(", ") : "observe";
}

function pluginMetric(id: string, savedTokens: number | undefined, category: string | undefined): string {
  if (id === "context-compressor-plugin") return `${num(savedTokens)} tokens saved`;
  if (id === "obsidian-graph-plugin") return "memory graph";
  if (id === "token-optimizer-plugin") return "recommendations";
  return category || "none";
}
