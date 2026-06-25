import { DataTable } from "../../components/data/DataTable";
import { DashboardSection } from "../../components/layout/DashboardSection";
import { eur, num, tokensOf } from "../../app/format";
import { BudgetMeter } from "./widgets";
import type { TeamView, UsageView, UserView } from "../../app/types";

export function OverviewDetails({ usage, currentUser }: { usage: UsageView; currentUser?: UserView }) {
  const users = usage.users || [];
  const teams = usage.teams || [];
  const user = resolveCurrentUser(currentUser, users);
  const teamIds = new Set(user?.teamIds || currentUser?.teamIds || []);
  const scopedTeams = teamIds.size ? teams.filter((team) => teamIds.has(team.id)) : teams;
  const scopedMembers = teamIds.size ? users.filter((item) => intersects(item.teamIds, teamIds)) : users;
  return <>
    <DashboardSection title="My teams">{scopedTeams.length ? <TeamTable teams={scopedTeams} /> : <div className="empty">No team usage yet.</div>}</DashboardSection>
    <DashboardSection title="Team members">{scopedMembers.length ? <MemberTable users={scopedMembers} teams={teams} currentUserId={user?.id} /> : <div className="empty">No member usage yet.</div>}</DashboardSection>
  </>;
}

function TeamTable({ teams }: { teams: TeamView[] }) {
  return <DataTable className="overview-table" rows={teams} rowKey={(team) => team.id} columns={[
    { key: "team", header: "Team", cell: (team) => <><div className="name">{team.name}</div><div className="rs">{team.id}</div></> },
    { key: "members", header: "Members", className: "num", cell: (team) => num(team.members) },
    { key: "tokens", header: "Tokens", className: "num", cell: (team) => num(tokensOf(team.usage)) },
    { key: "cost", header: "Cost", className: "num", cell: (team) => eur(team.usage?.costEur) },
    { key: "budget", header: "Budget", cell: (team) => <BudgetMeter used={tokensOf(team.usage)} limit={team.budget?.tokenLimit} period={team.budget?.period} /> }
  ]} />;
}

function MemberTable({ users, teams, currentUserId }: { users: UserView[]; teams: TeamView[]; currentUserId?: string }) {
  return <DataTable className="overview-table" rows={users} rowKey={(user) => user.id} columns={[
    { key: "member", header: "Member", cell: (user) => <><div className="name">{displayUser(user)} {user.id === currentUserId ? <span className="pill">you</span> : null}</div><div className="rs">{user.id}</div></> },
    { key: "role", header: "Role", cell: (user) => <span className="pill off">{user.role}</span> },
    { key: "teams", header: "Teams", cell: (user) => teamNames(user.teamIds, teams) },
    { key: "requests", header: "Requests", className: "num", cell: (user) => num(user.usage?.requests) },
    { key: "tokens", header: "Tokens", className: "num", cell: (user) => num(tokensOf(user.usage)) },
    { key: "cost", header: "Cost", className: "num", cell: (user) => eur(user.usage?.costEur) },
    { key: "budget", header: "Budget", cell: (user) => <BudgetMeter used={tokensOf(user.usage)} limit={user.budget?.tokenLimit} period={user.budget?.period} /> }
  ]} />;
}

function resolveCurrentUser(currentUser: UserView | undefined, users: UserView[]): UserView | undefined {
  const found = currentUser?.id ? users.find((user) => user.id === currentUser.id) : undefined;
  if (found && currentUser) return { ...currentUser, ...found };
  return found || currentUser || (users.length === 1 ? users[0] : undefined);
}

function intersects(ids: string[] | undefined, selected: Set<string>): boolean {
  return Boolean(ids?.some((id) => selected.has(id)));
}

function displayUser(user: UserView | undefined): string {
  return user?.displayName || user?.id || "Current user";
}

function teamNames(ids: string[] | undefined, teams: TeamView[]): string {
  return ids?.map((id) => teamName(id, teams)).join(", ") || "-";
}

function teamName(id: string | undefined, teams: TeamView[]): string {
  if (!id) return "-";
  return teams.find((team) => team.id === id)?.name || id;
}
