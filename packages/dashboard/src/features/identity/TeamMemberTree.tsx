import { useState } from "react";
import { ActionGroup } from "../../components/actions/ActionGroup";
import { DashboardSection } from "../../components/layout/DashboardSection";
import { CollapsibleGroup } from "../../components/data/CollapsibleGroup";
import { DataTable, type DataColumn } from "../../components/data/DataTable";
import { eur, num, tokensOf } from "../../app/format";
import { IconButton } from "../../components/actions/IconButton";
import type { ApiKeyView, TeamView, UserView } from "../../app/types";
import "./TeamMemberTree.css";

export function TeamMemberTree(props: { teams: TeamView[]; users: UserView[]; keys: ApiKeyView[]; onNewTeam?: () => void; onEditTeam?: (team: TeamView) => void; onTeamKey?: (team: TeamView) => void; onRemoveTeam?: (id: string) => void; onAssignUserToTeam?: (userId: string, teamId: string) => void | Promise<void>; onRemoveUserFromTeam?: (userId: string, teamId: string) => void | Promise<void> }) {
  const actions = props.onNewTeam ? <button className="ghost" onClick={props.onNewTeam}>+ New team</button> : null;
  return <DashboardSection title="Teams" actions={actions}>{props.teams.length ? <div className="team-tree-panel">
    {props.teams.map((team) => <TeamGroup key={team.id} team={team} users={usersForTeam(team, props.users)} keys={props.keys.filter((key) => key.teamId === team.id)} onEdit={props.onEditTeam} onKey={props.onTeamKey} onRemove={props.onRemoveTeam} onAssign={props.onAssignUserToTeam} onMemberRemove={props.onRemoveUserFromTeam} />)}
  </div> : <div className="empty">No teams yet.</div>}</DashboardSection>;
}

function TeamGroup({ team, users, keys, onEdit, onKey, onRemove, onAssign, onMemberRemove }: { team: TeamView; users: UserView[]; keys: ApiKeyView[]; onEdit?: (team: TeamView) => void; onKey?: (team: TeamView) => void; onRemove?: (id: string) => void; onAssign?: (userId: string, teamId: string) => void | Promise<void>; onMemberRemove?: (userId: string, teamId: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const requests = users.reduce((sum, user) => sum + Number(user.usage?.requests || 0), 0);
  const tokens = users.reduce((sum, user) => sum + tokensOf(user.usage), 0);
  const cost = users.reduce((sum, user) => sum + Number(user.usage?.costEur || 0), 0);
  const showActions = team.id !== "_unassigned" && Boolean(onEdit || onKey || onRemove);
  const canAssign = team.id !== "everyone" && Boolean(onAssign);
  const canRemoveMembers = team.id !== "everyone" && Boolean(onMemberRemove);
  const actions = showActions ? <ActionGroup as="span">{onEdit ? <IconButton icon="edit" label="Edit team" onClick={() => onEdit(team)} /> : null}{onKey ? <IconButton icon="key" label="Create team API key" onClick={() => onKey(team)} /> : null}{onRemove ? <IconButton icon="trash" label={team.id === "everyone" ? "Default team cannot be removed" : "Remove team"} disabled={team.id === "everyone"} danger onClick={() => onRemove(team.id)} /> : null}</ActionGroup> : null;
  const columns: DataColumn<UserView>[] = [
      { key: "user", header: "User", cell: (user) => <><div className="name">{user.displayName || user.id}</div><div className="rs">{user.id}</div></> },
      { key: "role", header: "Role", cell: (user) => <span className="pill off">{user.role}</span> },
      { key: "projects", header: "Projects", cell: (user) => projectsFor(user.id, keys) },
      { key: "requests", header: "Requests", className: "num", cell: (user) => num(user.usage?.requests) },
      { key: "tokens", header: "Tokens", className: "num", cell: (user) => num(tokensOf(user.usage)) },
      { key: "cost", header: "Cost", className: "num", cell: (user) => eur(user.usage?.costEur) },
      ...(canRemoveMembers ? [{ key: "actions", header: "", width: "54px", align: "right" as const, cell: (user: UserView) => <IconButton icon="trash" label="Remove from team" danger onClick={() => { void onMemberRemove?.(user.id, team.id); }} /> }] : [])
    ];
  const body = open ? users.length ? <DataTable wrapClassName="tree-table-wrap" className="tree-table" rows={users} rowKey={(user) => user.id} columns={columns} /> : <div className="empty tree-empty">No members in this team.</div> : null;
  return <CollapsibleGroup title={team.name} subtitle={`${team.id} - ${users.length} members - ${keys.length} keys - ${providerPolicy(team)}`} open={open} onToggle={setOpen} actions={actions} metrics={[{ key: "requests", content: `${num(requests)} requests` }, { key: "tokens", content: `${num(tokens)} tokens` }, { key: "cost", content: eur(cost) }]} onDropValue={canAssign ? async (userId) => { setOpen(true); await onAssign?.(userId, team.id); } : undefined}>{body}</CollapsibleGroup>;
}

function usersForTeam(team: TeamView, users: UserView[]): UserView[] {
  return team.id === "everyone" ? users : users.filter((user) => (user.teamIds || []).includes(team.id));
}

function projectsFor(userId: string, keys: ApiKeyView[]): string {
  const projects = [...new Set(keys.filter((key) => key.ownerUserId === userId).map((key) => key.project).filter(Boolean))];
  return projects.join(", ") || "-";
}

function providerPolicy(team: TeamView): string {
  return team.allowedProviders === "*" ? "All providers" : (team.allowedProviders || []).join(", ") || "No providers";
}
