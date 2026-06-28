import { useEffect, useState } from "react";

type Risk = "green" | "yellow" | "orange" | "red";
type TeamDraft = {
  enabledMode: "inherit" | "override";
  enabled: boolean;
  maxRiskMode: "inherit" | "override";
  maxRisk: Risk;
};

export function GlobalPluginSettingsForm({
  enabled, maxRisk, onSave
}: {
  enabled: boolean;
  maxRisk: Risk;
  onSave: (value: { enabled: boolean; maxRisk: Risk }) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({ enabled, maxRisk });
  useEffect(() => setDraft({ enabled, maxRisk }), [enabled, maxRisk]);
  return <form className="plugin-inline-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
    <label><span>Enabled</span><select value={String(draft.enabled)} onChange={(event) => { const value = event.currentTarget.value; setDraft((prev) => ({ ...prev, enabled: value === "true" })); }}>
      <option value="true">enabled</option>
      <option value="false">disabled</option>
    </select></label>
    <label><span>Max risk</span><select value={draft.maxRisk} onChange={(event) => { const value = event.currentTarget.value as Risk; setDraft((prev) => ({ ...prev, maxRisk: value })); }}>
      <option value="green">green</option>
      <option value="yellow">yellow</option>
      <option value="orange">orange</option>
      <option value="red">red</option>
    </select></label>
    <button type="submit" className="primary">Save global defaults</button>
  </form>;
}

export function TeamPluginSettingsForm({
  draft, onSave, onReset
}: {
  draft: TeamDraft;
  onSave: (value: TeamDraft) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}) {
  const [local, setLocal] = useState(draft);
  useEffect(() => setLocal(draft), [draft]);
  return <form className="plugin-settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(local); }}>
    <label><span>Enabled mode</span><select value={local.enabledMode} onChange={(event) => { const value = event.currentTarget.value as TeamDraft["enabledMode"]; setLocal((prev) => ({ ...prev, enabledMode: value })); }}>
      <option value="inherit">inherit global</option>
      <option value="override">override team</option>
    </select></label>
    <label><span>Enabled value</span><select disabled={local.enabledMode === "inherit"} value={String(local.enabled)} onChange={(event) => { const value = event.currentTarget.value; setLocal((prev) => ({ ...prev, enabled: value === "true" })); }}>
      <option value="true">enabled</option>
      <option value="false">disabled</option>
    </select></label>
    <label><span>Risk mode</span><select value={local.maxRiskMode} onChange={(event) => { const value = event.currentTarget.value as TeamDraft["maxRiskMode"]; setLocal((prev) => ({ ...prev, maxRiskMode: value })); }}>
      <option value="inherit">inherit global</option>
      <option value="override">override team</option>
    </select></label>
    <label><span>Risk value</span><select disabled={local.maxRiskMode === "inherit"} value={local.maxRisk} onChange={(event) => { const value = event.currentTarget.value as Risk; setLocal((prev) => ({ ...prev, maxRisk: value })); }}>
      <option value="green">green</option>
      <option value="yellow">yellow</option>
      <option value="orange">orange</option>
      <option value="red">red</option>
    </select></label>
    <div className="plugin-settings-actions">
      <button type="submit" className="primary">Save team overrides</button>
      <button type="button" className="ghost" onClick={() => void onReset()}>Reset team overrides</button>
    </div>
  </form>;
}

export type { TeamDraft };
