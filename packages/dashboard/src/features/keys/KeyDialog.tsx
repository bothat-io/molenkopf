import { FormEvent, useState } from "react";
import { postJson } from "../../app/api";
import { DialogCloseAction, DialogError, DialogFormActions, DialogFrame, messageOf } from "../../components/modal/DialogFrame";
import type { TeamView, UserView } from "../../app/types";

export function KeyDialog({ close, reload, owner, team, users, teams, onKeyCreated }: { close: () => void; reload: () => void; owner?: UserView; team?: TeamView; users: UserView[]; teams: TeamView[]; onKeyCreated: (secret: string) => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const ownerOptions = team ? users.filter((user) => !user.disabled && (user.teamIds || []).includes(team.id)) : (owner ? [owner] : []);
  const teamIds = team ? [team.id] : (owner?.teamIds || []);
  const teamOptions = teamIds.map((id) => teams.find((item) => item.id === id) || { id, name: id });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const project = String(f.get("project") || "").trim();
    const teamId = String(f.get("teamId") || team?.id || "").trim() || undefined;
    const ownerId = String(f.get("owner") || owner?.id || "").trim();
    if (!ownerId) return setError("Owner is required");
    if (!project) return setError("Project is required");
    try {
      const r = await postJson<{ secret: string }>("/__molenkopf/keys", { owner: ownerId, teamId, agentLabel: f.get("label"), project });
      setSecret(r.secret); onKeyCreated(r.secret); reload();
    } catch (err) { setError(messageOf(err, "key_failed")); }
  }
  if (secret) return <DialogFrame title={team ? "Team API key" : "New API key"}><div className="stack"><p className="hint">Copy this secret now. It is shown only once.</p><div className="reveal">{secret}</div><DialogCloseAction close={close} /></div></DialogFrame>;
  return <DialogFrame title={team ? "Team API key" : "New API key"}><form onSubmit={submit} className="stack"><p className="hint">{team ? `Team: ${team.name}` : owner ? `Owner: ${owner.displayName || owner.id}` : "This creates a key for your signed-in account."}</p>{team ? <label>Owner<select name="owner" defaultValue={ownerOptions[0]?.id || ""}>{ownerOptions.map((item) => <option key={item.id} value={item.id}>{item.displayName || item.id}</option>)}</select></label> : null}{team && !ownerOptions.length ? <p className="hint danger-text">Add a team member before creating a team key.</p> : null}<label>Label<input name="label" /></label><label>Project<input name="project" placeholder="project-a / team-a / test-lab" defaultValue={team?.id || ""} /></label>{teamOptions.length ? <label>Team<select name="teamId" defaultValue={teamOptions[0].id}>{teamOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<DialogError value={error} /><DialogFormActions close={close} save="Create key" disabled={Boolean(team && !ownerOptions.length)} /></form></DialogFrame>;
}
