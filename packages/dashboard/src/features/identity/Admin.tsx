import { IconButton } from "../../components/actions/IconButton";
import { ActionGroup } from "../../components/actions/ActionGroup";
import { DataTable } from "../../components/data/DataTable";
import { canCreateOwnKey, canRevokeOwnKey } from "../keys/keyPermissions";
import { MetricStrip } from "../../components/layout/MetricStrip";
import { SectionTitle } from "../../components/layout/DashboardSection";
import { PluginSections, ProviderSection, configuredProviders } from "../providers/ProviderSections";
import { TeamMemberTree } from "./TeamMemberTree";
import { tokensOf } from "../../app/format";
import type { DashboardData, TeamView, UserView } from "../../app/types";

export function AdminTab(props: {
  data: DashboardData;
  onNewUser: () => void;
  onNewTeam: () => void;
  onNewProvider: () => void;
  onEditUser: (user: UserView) => void;
  onEditTeam: (team: TeamView) => void;
  onUserKey: (user: UserView) => void;
  onTeamKey: (team: TeamView) => void;
  onRemoveUser: (id: string) => void;
  onRemoveTeam: (id: string) => void;
  onAssignUserToTeam: (userId: string, teamId: string) => void;
  onRemoveUserFromTeam: (userId: string, teamId: string) => void;
  onProviderRemove: (id: string) => void;
  onProviderOptions: (id: string) => void;
  providerMessages: Record<string, string>;
  onProviderTest: (id: string) => void;
  onProviderWeight: (id: string, share: number) => void;
  onPluginToggle: (id: string, enabled: boolean) => void;
  onPluginMove: (id: string, direction: "up" | "down") => void;
}) {
  const users = mergeUsers(props.data.identity?.users || [], props.data.usage.users || []);
  const teams = mergeTeams(props.data.identity?.teams || [], props.data.usage.teams || []);
  const providers = props.data.providers;
  const providerItems = configuredProviders(providers);
  const providerTokens = providerItems.reduce((sum, p) => sum + tokensOf(p.usage), 0);
  const upstream = Number(props.data.summary.upstreamInputTokens || 0) + Number(props.data.summary.upstreamOutputTokens || 0);
  return <>
    <MetricStrip items={[{ value: props.data.summary.requests, label: "Requests" }, { value: upstream || providerTokens, label: "Upstream tokens" }, { value: providerItems.length, label: "Providers" }]} />
    <ProviderSection providers={providers} teams={teams} testMessages={props.providerMessages} onNew={props.onNewProvider} onWeight={props.onProviderWeight} onRemove={props.onProviderRemove} onOptions={props.onProviderOptions} onTest={props.onProviderTest} />
    <TeamMemberTree teams={teams} users={users} keys={props.data.usage.keys || []} onNewTeam={props.onNewTeam} onEditTeam={props.onEditTeam} onTeamKey={props.onTeamKey} onRemoveTeam={props.onRemoveTeam} onAssignUserToTeam={props.onAssignUserToTeam} onRemoveUserFromTeam={props.onRemoveUserFromTeam} />
    <UsersTable users={users} onNew={props.onNewUser} onEdit={props.onEditUser} onKey={props.onUserKey} onRemove={props.onRemoveUser} />
    <PluginSections plugins={props.data.plugins} summary={props.data.summary} onToggle={props.onPluginToggle} onMove={props.onPluginMove} />
  </>;
}

function UsersTable({ users, onNew, onEdit, onKey, onRemove }: { users: UserView[]; onNew: () => void; onEdit: (user: UserView) => void; onKey: (user: UserView) => void; onRemove: (id: string) => void }) {
  return <section><SectionTitle label="Users"><button className="ghost" onClick={onNew}>+ New user</button></SectionTitle><DataTable className="admin-table users-table" rows={users} rowKey={(user) => user.id} empty={<div className="empty">No users yet.</div>} rowProps={(user) => ({ draggable: true, title: "Drag user into a team", onDragStart: (event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/molenkopf-user", user.id); } })} columns={[
    { key: "user", header: "User", width: "24%", cell: (user) => <><div className="name">{user.displayName || user.id}</div><div className="rs">{user.id}</div></> },
    { key: "role", header: "Role", width: "11%", cell: (user) => <span className="pill off">{user.role}</span> },
    { key: "teams", header: "Teams", width: "25%", cell: (user) => (user.teamIds || []).join(", ") || "-" },
    { key: "status", header: "Status", width: "12%", cell: loginStatus },
    { key: "keys", header: "Keys", width: "14%", cell: keyPolicy },
    { key: "actions", header: "Actions", width: "132px", align: "right", cell: (user) => <ActionGroup><IconButton icon="edit" label="Edit user" onClick={() => onEdit(user)} /><IconButton icon="key" label="Create API key" onClick={() => onKey(user)} /><IconButton icon="trash" label="Remove user" danger onClick={() => onRemove(user.id)} /></ActionGroup> }
  ]} /></section>;
}

function mergeUsers(identity: UserView[], usage: UserView[]): UserView[] {
  const usageById = new Map(usage.map((item) => [item.id, item]));
  return (identity.length ? identity : usage).map((item) => ({ ...item, usage: usageById.get(item.id)?.usage }));
}

function mergeTeams(identity: TeamView[], usage: TeamView[]): TeamView[] {
  const usageById = new Map(usage.map((item) => [item.id, item]));
  return (identity.length ? identity : usage).map((item) => ({ ...item, members: usageById.get(item.id)?.members ?? item.members, usage: usageById.get(item.id)?.usage }));
}

function keyPolicy(user: UserView) {
  const rights = [canCreateOwnKey(user) ? "create" : "", canRevokeOwnKey(user) ? "revoke" : ""].filter(Boolean);
  return rights.length ? rights.map((right) => <span className="pill off" key={right}>{right}</span>) : <span className="pill off">none</span>;
}

function loginStatus(user: UserView) {
  if (user.disabled) return <span className="pill off">account off</span>;
  if (user.loginDisabled) return <span className="pill off">login off</span>;
  return user.hasPassword ? <span className="pill">login on</span> : <span className="pill off">no password</span>;
}
