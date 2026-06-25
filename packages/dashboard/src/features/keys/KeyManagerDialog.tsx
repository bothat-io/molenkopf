import { FormEvent, useMemo, useState } from "react";
import { postJson } from "../../app/api";
import { shortDate } from "../../app/format";
import { ActionGroup } from "../../components/actions/ActionGroup";
import { IconButton } from "../../components/actions/IconButton";
import { DataTable } from "../../components/data/DataTable";
import { FormActionBar, FormField, FormGrid, SelectControl } from "../../components/forms/FormControls";
import { DialogError, DialogFrame, messageOf } from "../../components/modal/DialogFrame";
import type { ApiKeyView, TeamView, UserView } from "../../app/types";
import "./KeyManagerDialog.css";

type Props = {
  close: () => void;
  reload: () => void;
  owner?: UserView;
  team?: TeamView;
  users: UserView[];
  teams: TeamView[];
  keys: ApiKeyView[];
  onKeyCreated: (secret: string) => void;
};

export function KeyManagerDialog(props: Props) {
  const [editing, setEditing] = useState<ApiKeyView>();
  const [createOwner, setCreateOwner] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const usersById = useMemo(() => new Map(props.users.map((user) => [user.id, user])), [props.users]);
  const scopedKeys = useMemo(() => visibleKeys(props.keys, props.owner, props.team), [props.keys, props.owner, props.team]);
  const ownerOptions = useMemo(() => ownerChoices(props.users, props.owner, props.team), [props.users, props.owner, props.team]);
  const createOwnerId = props.owner?.id || createOwner || ownerOptions[0]?.id || "";
  const createTeams = teamChoices(usersById.get(createOwnerId), props.teams, props.team);
  const title = props.team ? `${props.team.name} API keys` : `${props.owner?.displayName || props.owner?.id || "User"} API keys`;

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const owner = props.owner?.id || String(f.get("owner") || "").trim();
    const teamId = props.team?.id || String(f.get("teamId") || "").trim();
    const project = String(f.get("project") || "").trim();
    if (!owner) return setError("Owner is required");
    if (!project) return setError("Project is required");
    try {
      const result = await postJson<{ secret: string }>("/__molenkopf/keys", { owner, teamId, project, agentLabel: f.get("label") });
      setSecret(result.secret);
      props.onKeyCreated(result.secret);
      props.reload();
    } catch (err) {
      setError(messageOf(err, "key_create_failed"));
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const f = new FormData(event.currentTarget);
    try {
      await postJson("/__molenkopf/keys/update", { id: editing.id, project: f.get("project"), agentLabel: f.get("label"), teamId: f.get("teamId") });
      setEditing(undefined);
      props.reload();
    } catch (err) {
      setError(messageOf(err, "key_update_failed"));
    }
  }

  async function revoke(id: string) {
    try {
      await postJson("/__molenkopf/keys/revoke", { id });
      props.reload();
    } catch (err) {
      setError(messageOf(err, "key_revoke_failed"));
    }
  }

  return <DialogFrame title={title} wide><div className="key-manager">
    {secret ? <div className="key-secret"><span>Copy this secret now. It is shown only once.</span><code>{secret}</code></div> : null}
    <KeyTable keys={scopedKeys} users={usersById} teams={props.teams} onEdit={setEditing} onRevoke={revoke} />
    {editing ? <EditKeyForm apiKey={editing} owner={usersById.get(editing.ownerUserId)} teams={teamChoices(usersById.get(editing.ownerUserId), props.teams, props.team)} onSubmit={submitEdit} onCancel={() => setEditing(undefined)} /> : <CreateKeyForm owner={props.owner} ownerOptions={ownerOptions} teamOptions={createTeams} onOwnerChange={setCreateOwner} onSubmit={submitCreate} onCancel={props.close} />}
    <DialogError value={error} />
  </div></DialogFrame>;
}

function KeyTable({ keys, users, teams, onEdit, onRevoke }: { keys: ApiKeyView[]; users: Map<string, UserView>; teams: TeamView[]; onEdit: (key: ApiKeyView) => void; onRevoke: (id: string) => void }) {
  const teamName = (id?: string) => teams.find((team) => team.id === id)?.name || id || "-";
  return <DataTable className="key-manager-table" rows={keys} rowKey={(apiKey) => apiKey.id} empty={<div className="empty">No API keys in this scope.</div>} columns={[
    { key: "key", header: "Key", width: "24%", cell: (apiKey) => <><div className="name">{apiKey.agentLabel || apiKey.id}</div><code>{apiKey.prefix}...</code>{apiKey.disabled ? <span className="pill off">revoked</span> : null}</> },
    { key: "owner", header: "Owner", width: "23%", cell: (apiKey) => users.get(apiKey.ownerUserId)?.displayName || apiKey.ownerUserId },
    { key: "project", header: "Project", width: "18%", cell: (apiKey) => apiKey.project || "required" },
    { key: "team", header: "Team", width: "15%", cell: (apiKey) => teamName(apiKey.teamId) },
    { key: "last", header: "Last used", width: "12%", cell: (apiKey) => shortDate(apiKey.lastUsedAt) || "never" },
    { key: "actions", header: "Actions", width: "92px", align: "right", cell: (apiKey) => <ActionGroup><IconButton icon="edit" label="Edit API key" onClick={() => onEdit(apiKey)} /><IconButton icon="trash" label="Revoke API key" danger disabled={apiKey.disabled} onClick={() => onRevoke(apiKey.id)} /></ActionGroup> }
  ]} />;
}

function CreateKeyForm({ owner, ownerOptions, teamOptions, onOwnerChange, onSubmit, onCancel }: { owner?: UserView; ownerOptions: UserView[]; teamOptions: TeamView[]; onOwnerChange: (id: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="form-panel key-manager-form"><h3>New project key</h3><FormGrid>
    {owner ? null : <FormField label="Owner"><SelectControl name="owner" options={ownerOptions.map((item) => ({ id: item.id, label: item.displayName || item.id }))} onChange={onOwnerChange} /></FormField>}
    <FormField label="Label"><input name="label" placeholder="local codex / team runner" /></FormField>
    <FormField label="Project"><input name="project" required placeholder="project-a" /></FormField>
    <FormField label="Team"><SelectControl name="teamId" options={teamOptions.map((team) => ({ id: team.id, label: team.name }))} /></FormField>
  </FormGrid><FormActionBar primary="Create key" primaryDisabled={!ownerOptions.length || !teamOptions.length} onAbort={onCancel} /></form>;
}

function EditKeyForm({ apiKey, owner, teams, onSubmit, onCancel }: { apiKey: ApiKeyView; owner?: UserView; teams: TeamView[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="form-panel key-manager-form"><h3>Edit project key</h3><p className="form-note">Owner: {owner?.displayName || apiKey.ownerUserId}. Secrets cannot be revealed again.</p><FormGrid>
    <FormField label="Label"><input name="label" defaultValue={apiKey.agentLabel || ""} /></FormField>
    <FormField label="Project"><input name="project" required defaultValue={apiKey.project || ""} /></FormField>
    <FormField label="Team"><SelectControl name="teamId" defaultValue={apiKey.teamId || teams[0]?.id} options={teams.map((team) => ({ id: team.id, label: team.name }))} /></FormField>
  </FormGrid><FormActionBar primary="Save key" abort="Cancel edit" onAbort={onCancel} /></form>;
}

function visibleKeys(keys: ApiKeyView[], owner?: UserView, team?: TeamView): ApiKeyView[] {
  if (team) return keys.filter((key) => key.teamId === team.id);
  if (owner) return keys.filter((key) => key.ownerUserId === owner.id);
  return keys;
}

function ownerChoices(users: UserView[], owner?: UserView, team?: TeamView): UserView[] {
  if (owner) return [owner];
  if (!team) return users.filter((user) => !user.disabled);
  return users.filter((user) => !user.disabled && (team.id === "everyone" || (user.teamIds || []).includes(team.id)));
}

function teamChoices(owner: UserView | undefined, teams: TeamView[], fixed?: TeamView): TeamView[] {
  if (fixed) return [fixed];
  const allowed = new Set(owner?.teamIds || []);
  return teams.filter((team) => allowed.has(team.id));
}
