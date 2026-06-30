import { useEffect, useState } from "react";
import type { PluginSettingSchema } from "../../app/types";

type Risk = "green" | "yellow" | "orange" | "red";
type PolicyDetails = { capabilities: string[]; actions: string[]; settings: Record<string, unknown> };
type PolicyOptions = {
  availableCapabilities: string[];
  availableActions: string[];
  settingsSchema?: PluginSettingSchema;
};
type GlobalDraft = { enabled: boolean; maxRisk: Risk } & PolicyDetails;
type TeamDraft = {
  enabledMode: "inherit" | "override";
  enabled: boolean;
  maxRiskMode: "inherit" | "override";
  maxRisk: Risk;
  capabilitiesMode: "inherit" | "override";
  actionsMode: "inherit" | "override";
  settingsMode: "inherit" | "override";
} & PolicyDetails;

export function GlobalPluginSettingsForm({
  enabled, maxRisk, capabilities, actions, settings, availableCapabilities, availableActions, settingsSchema, onSave
}: {
  enabled: boolean;
  maxRisk: Risk;
  onSave: (value: GlobalDraft) => Promise<void> | void;
} & PolicyDetails & PolicyOptions) {
  const [draft, setDraft] = useState<GlobalDraft>({ enabled, maxRisk, capabilities, actions, settings });
  useEffect(() => setDraft({ enabled, maxRisk, capabilities, actions, settings }), [enabled, maxRisk, capabilities, actions, settings]);
  return <form className="plugin-settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
    <label><span>Enabled</span><select value={String(draft.enabled)} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.currentTarget.value === "true" }))}>
      <option value="true">enabled</option>
      <option value="false">disabled</option>
    </select></label>
    <RiskSelect value={draft.maxRisk} onChange={(maxRisk) => setDraft((prev) => ({ ...prev, maxRisk }))} />
    <PolicyFields
      value={draft}
      options={{ availableCapabilities, availableActions, settingsSchema }}
      onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
    />
    <button type="submit" className="primary">Save global defaults</button>
  </form>;
}

export function TeamPluginSettingsForm({
  draft, availableCapabilities, availableActions, settingsSchema, onSave, onReset
}: {
  draft: TeamDraft;
  onSave: (value: TeamDraft) => Promise<void> | void;
  onReset: () => Promise<void> | void;
} & PolicyOptions) {
  const [local, setLocal] = useState(draft);
  useEffect(() => setLocal(draft), [draft]);
  return <form className="plugin-settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(local); }}>
    <ModeSelect label="Enabled mode" value={local.enabledMode} onChange={(enabledMode) => setLocal((prev) => ({ ...prev, enabledMode }))} />
    <label><span>Enabled value</span><select disabled={local.enabledMode === "inherit"} value={String(local.enabled)} onChange={(event) => setLocal((prev) => ({ ...prev, enabled: event.currentTarget.value === "true" }))}>
      <option value="true">enabled</option>
      <option value="false">disabled</option>
    </select></label>
    <ModeSelect label="Risk mode" value={local.maxRiskMode} onChange={(maxRiskMode) => setLocal((prev) => ({ ...prev, maxRiskMode }))} />
    <RiskSelect disabled={local.maxRiskMode === "inherit"} value={local.maxRisk} onChange={(maxRisk) => setLocal((prev) => ({ ...prev, maxRisk }))} />
    <ModeSelect label="Capabilities mode" value={local.capabilitiesMode} onChange={(capabilitiesMode) => setLocal((prev) => ({ ...prev, capabilitiesMode }))} />
    <PolicyFields
      value={local}
      options={{ availableCapabilities, availableActions: [], settingsSchema: undefined }}
      disabled={local.capabilitiesMode === "inherit"}
      onChange={(next) => setLocal((prev) => ({ ...prev, ...next }))}
    />
    <ModeSelect label="Actions mode" value={local.actionsMode} onChange={(actionsMode) => setLocal((prev) => ({ ...prev, actionsMode }))} />
    <PolicyFields
      value={local}
      options={{ availableCapabilities: [], availableActions, settingsSchema: undefined }}
      disabled={local.actionsMode === "inherit"}
      onChange={(next) => setLocal((prev) => ({ ...prev, ...next }))}
    />
    <ModeSelect label="Settings mode" value={local.settingsMode} onChange={(settingsMode) => setLocal((prev) => ({ ...prev, settingsMode }))} />
    <PolicyFields
      value={local}
      options={{ availableCapabilities: [], availableActions: [], settingsSchema }}
      disabled={local.settingsMode === "inherit"}
      onChange={(next) => setLocal((prev) => ({ ...prev, ...next }))}
    />
    <div className="plugin-settings-actions">
      <button type="submit" className="primary">Save team overrides</button>
      <button type="button" className="ghost" onClick={() => void onReset()}>Reset team overrides</button>
    </div>
  </form>;
}

function PolicyFields({ value, options, onChange, disabled = false }: {
  value: PolicyDetails;
  options: PolicyOptions;
  disabled?: boolean;
  onChange: (next: Partial<PolicyDetails>) => void;
}) {
  return <>
    <CheckboxList label="Allowed capabilities" disabled={disabled} values={options.availableCapabilities} selected={value.capabilities} onChange={(capabilities) => onChange({ capabilities })} />
    <CheckboxList label="Allowed actions" disabled={disabled} values={options.availableActions} selected={value.actions} onChange={(actions) => onChange({ actions })} />
    {options.settingsSchema ? <SettingsFields schema={options.settingsSchema} value={value.settings} disabled={disabled} onChange={(settings) => onChange({ settings })} /> : null}
  </>;
}

function ModeSelect({ label, value, onChange }: { label: string; value: "inherit" | "override"; onChange: (value: "inherit" | "override") => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.currentTarget.value as "inherit" | "override")}>
      <option value="inherit">inherit global</option>
      <option value="override">override team</option>
    </select></label>
}

function RiskSelect({ value, disabled = false, onChange }: { value: Risk; disabled?: boolean; onChange: (value: Risk) => void }) {
  return <label><span>Risk value</span><select disabled={disabled} value={value} onChange={(event) => onChange(event.currentTarget.value as Risk)}>
      <option value="green">green</option>
      <option value="yellow">yellow</option>
      <option value="orange">orange</option>
      <option value="red">red</option>
    </select></label>;
}

function CheckboxList(props: { label: string; values: string[]; selected: string[]; disabled?: boolean; onChange: (value: string[]) => void }) {
  if (!props.values.length) return null;
  return <fieldset className="plugin-checkbox-list" disabled={props.disabled}>
    <legend>{props.label}</legend>
    {props.values.map((item) => <label key={item}><input type="checkbox" checked={props.selected.includes(item)} onChange={(event) => {
      props.onChange(event.currentTarget.checked ? [...props.selected, item] : props.selected.filter((entry) => entry !== item));
    }} /> <span>{item}</span></label>)}
  </fieldset>;
}

function SettingsFields({ schema, value, disabled, onChange }: { schema: PluginSettingSchema; value: Record<string, unknown>; disabled?: boolean; onChange: (value: Record<string, unknown>) => void }) {
  if (schema.type !== "object" || !schema.properties) return null;
  return <fieldset className="plugin-settings-schema" disabled={disabled}>
    <legend>Settings</legend>
    {Object.entries(schema.properties).map(([key, child]) => <SettingField key={key} name={key} schema={child} value={value[key] ?? child.default} onChange={(next) => onChange({ ...value, [key]: next })} />)}
  </fieldset>;
}

function SettingField({ name, schema, value, onChange }: { name: string; schema: PluginSettingSchema; value: unknown; onChange: (value: unknown) => void }) {
  if (schema.type === "boolean") return <label><span>{name}</span><select value={String(Boolean(value))} onChange={(event) => onChange(event.currentTarget.value === "true")}><option value="true">true</option><option value="false">false</option></select></label>;
  if (schema.type === "enum") return <label><span>{name}</span><select value={String(value ?? schema.default ?? schema.values?.[0] ?? "")} onChange={(event) => onChange(event.currentTarget.value)}>{(schema.values || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>;
  if (schema.type === "integer" || schema.type === "number") return <label><span>{name}</span><input type="number" min={schema.minimum} max={schema.maximum} step={schema.type === "integer" ? 1 : "any"} value={Number(value ?? schema.default ?? 0)} onChange={(event) => onChange(schema.type === "integer" ? Math.trunc(event.currentTarget.valueAsNumber) : event.currentTarget.valueAsNumber)} /></label>;
  if (schema.type === "array" && schema.items?.type === "enum") return <CheckboxList label={name} values={schema.items.values || []} selected={Array.isArray(value) ? value.map(String) : []} onChange={onChange as (value: string[]) => void} />;
  return <label><span>{name}</span><input type="text" value={String(value ?? schema.default ?? "")} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

export type { GlobalDraft, TeamDraft };
