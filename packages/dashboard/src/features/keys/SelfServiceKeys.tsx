import { useMemo, useState } from "react";
import { connectLines, shellLabel, type ConnectShell, type ConnectTool } from "./commands";
import { ActionGroup } from "../../components/actions/ActionGroup";
import { DataTable } from "../../components/data/DataTable";
import { DashboardSection } from "../../components/layout/DashboardSection";
import { shortDate } from "../../app/format";
import { IconButton } from "../../components/actions/IconButton";
import { CopyButton } from "../../components/actions/CopyButton";
import { canCreateOwnKey, canRevokeOwnKey } from "./keyPermissions";
import type { ApiKeyView, ConfigView, UserView } from "../../app/types";
import "./SelfServiceKeys.css";

export function SelfServiceKeys(props: { keys: ApiKeyView[]; currentUser?: UserView; config: ConfigView; selectedSecret: string; onNewKey: () => void; onRevoke: (id: string) => void }) {
  const [tool, setTool] = useState<ConnectTool>("claude");
  const [shell, setShell] = useState<ConnectShell>("powershell");
  const base = `http://${props.config.bindHost || "127.0.0.1"}:${props.config.port || 8787}`;
  const commandKey = props.selectedSecret || "<molenkopf-api-key>";
  const command = useMemo(() => connectLines(tool, shell, base, commandKey).join("\n"), [tool, shell, base, commandKey]);
  const canCreate = canCreateOwnKey(props.currentUser);
  const canRevoke = canRevokeOwnKey(props.currentUser);
  return <>
    <DashboardSection title="My project keys" actions={canCreate ? <button className="ghost" onClick={props.onNewKey}>+ New key</button> : null}>
      {props.keys.length ? <ApiKeyTable keys={props.keys} canRevoke={canRevoke} onRevoke={props.onRevoke} /> : <div className="empty">{canCreate ? "No API keys yet. Create one to point a tool at Molenkopf." : "You are not allowed to create project API keys."}</div>}
    </DashboardSection>
    <DashboardSection title="Connect your tool">
      <div className="connect">
        <div className="connect-head"><div><h2>Start setup</h2><p>Pick a target tool and shell, then copy the start commands. Replace the placeholder with a real key when needed.</p></div></div>
      <Segment label="Target tool" items={["claude", "codex", "other"]} value={tool} onPick={(v) => setTool(v as ConnectTool)} />
      <Segment label="Shell" items={["powershell", "cmd", "bash"]} value={shell} onPick={(v) => setShell(v as ConnectShell)} />
      <div className="terminal">
        <div className="term-bar"><span /><span /><span /><b>molenkopf ~ {tool} / {shellLabel(shell)}</b></div>
        <pre>{command}</pre>
        <CopyButton text={command} />
      </div>
      <p className="hint">{props.selectedSecret ? "Run this in your local shell. Existing keys are never revealed again." : "Existing keys cannot be revealed again. The placeholder marks where your Molenkopf key belongs."}</p>
      </div>
    </DashboardSection>
  </>;
}

function ApiKeyTable({ keys, canRevoke, onRevoke }: { keys: ApiKeyView[]; canRevoke: boolean; onRevoke: (id: string) => void }) {
  return <DataTable className="key-table" rows={keys} rowKey={(apiKey) => apiKey.id} columns={[
    { key: "key", header: "Key", cell: (apiKey) => <><div className="name">{apiKey.agentLabel || apiKey.id}</div><code>{apiKey.prefix}...</code>{apiKey.disabled ? <span className="pill off">revoked</span> : null}</> },
    { key: "owner", header: "Owner", cell: (apiKey) => apiKey.ownerUserId },
    { key: "project", header: "Project", cell: (apiKey) => apiKey.project || "required" },
    { key: "team", header: "Team", cell: (apiKey) => apiKey.teamId || "-" },
    { key: "lastUsed", header: "Last used", cell: (apiKey) => shortDate(apiKey.lastUsedAt) || "never used" },
    { key: "actions", header: "Actions", width: "132px", cell: (apiKey) => <ActionGroup>{canRevoke && !apiKey.disabled ? <IconButton icon="trash" label="Revoke key" danger onClick={() => onRevoke(apiKey.id)} /> : <span className="pill off">locked</span>}</ActionGroup> }
  ]} />;
}

function Segment({ label, items, value, onPick }: { label: string; items: string[]; value: string; onPick: (value: string) => void }) {
  return <div className="field-block"><p>{label}</p><div className="tabs">{items.map((item) => <button key={item} className={item === value ? "on" : ""} onClick={() => onPick(item)}>{item === "cmd" ? "CMD" : item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>;
}
