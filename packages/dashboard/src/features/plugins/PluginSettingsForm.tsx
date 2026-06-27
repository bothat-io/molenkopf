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
  return <form className="plugin-settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
    <label><span>Enabled</span><select value={String(draft.enabled)} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.currentTarget.value === "true" }))}>
      <option value="true">enabled</option>
      <option value="false">disabled</option>
    </select></label>
    <label><span>Max risk</span><select value={draft.maxRisk} onChange={(event) => setDraft((prev) => ({ ...prev, maxRisk: event.currentTarget.value as Risk }))}>
      <option value="green">green</option>
      <option value="yellow">yellow</option>
      <option value="orange">orange</option>
      <option value="red">red</option>
    </select></label>
    <button type="submit" className="ghost">Save global defaults</button>
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
    <label><span>Enabled mode</span><select value={local.enabledMode} onChange={(event) => setLocal((prev) => ({ ...prev, enabledMode: event.currentTarget.value as TeamDraft["enabledMode"] }))}>
      <option value="inherit">inherit global</option>
      <option value="override">override team</option>
    </select></label>
    <label><span>Enabled value</span><select disabled={local.enabledMode === "inherit"} value={String(local.enabled)} onChange={(event) => setLocal((prev) => ({ ...prev, enabled: event.currentTarget.value === "true" }))}>
      <option value="true">enabled</option>
      <option value="false">disabled</option>
    </select></label>
    <label><span>Risk mode</span><select value={local.maxRiskMode} onChange={(event) => setLocal((prev) => ({ ...prev, maxRiskMode: event.currentTarget.value as TeamDraft["maxRiskMode"] }))}>
      <option value="inherit">inherit global</option>
      <option value="override">override team</option>
    </select></label>
    <label><span>Risk value</span><select disabled={local.maxRiskMode === "inherit"} value={local.maxRisk} onChange={(event) => setLocal((prev) => ({ ...prev, maxRisk: event.currentTarget.value as Risk }))}>
      <option value="green">green</option>
      <option value="yellow">yellow</option>
      <option value="orange">orange</option>
      <option value="red">red</option>
    </select></label>
    <div className="plugin-settings-actions">
      <button type="submit" className="ghost">Save team overrides</button>
      <button type="button" className="ghost" onClick={() => void onReset()}>Reset team overrides</button>
    </div>
  </form>;
}

export type { TeamDraft };
