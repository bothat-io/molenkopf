import type { IncomingMessage, ServerResponse } from "node:http";
import { cleanKeyLabel, cleanKeyProject, issueApiKey, listKeys, revokeKey } from "../../../core/src/identity/api-keys.ts";
import { normalizeBudget } from "../../../core/src/identity/budget.ts";
import { canCreateOwnKey, canRevokeOwnKey } from "../../../core/src/identity/key-permissions.ts";
import { DEFAULT_TEAM_ID, isDefaultTeamId, nonDefaultTeamIds } from "../../../core/src/identity/team-scope.ts";
import { viewKey, viewUser, type User } from "../../../core/src/identity/types.ts";
import { emptyUsage } from "./runtime-state.ts";
import { orgCostUsed, orgTokensUsed, usageForPeriod, userUsageKey } from "./usage-accounting.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { canManage, type AuthUser } from "./auth-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";

// Key management + scoped usage. Admin/open mode manages any owner; a logged-in
// member manages only their own keys and sees only their own scope.

function ownerScope(state: RuntimeState, user: AuthUser | undefined): string | undefined {
  return canManage(state, user) ? undefined : user?.id; // undefined => all
}

export function listKeysHandler(_req: IncomingMessage, res: ServerResponse, state: RuntimeState, user: AuthUser | undefined) {
  if (!state.identity) return writeJson(res, 200, { items: [] });
  writeJson(res, 200, { items: listKeys(state.identity, ownerScope(state, user)) });
}

export async function issueKeyHandler(req: IncomingMessage, res: ServerResponse, state: RuntimeState, user: AuthUser | undefined) {
  if (!state.identity) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const scope = ownerScope(state, user);
  const explicitOwner = typeof body.owner === "string" ? body.owner.trim() : "";
  const owner = scope ?? (explicitOwner || user?.id || "");
  if (!owner) return writeJson(res, 400, { error: "owner_required" });
  if (scope && owner !== scope) return writeJson(res, 403, { error: "forbidden" });
  if (scope && !canCreateOwnKey(user)) return writeJson(res, 403, { error: "key_create_forbidden" });
  const project = typeof body.project === "string" ? cleanKeyProject(body.project) : undefined;
  if (!project) return writeJson(res, 400, { error: "project_required" });
  const teamId = validKeyTeam(state, owner, body.teamId);
  if (teamId === false) return writeJson(res, 400, { error: "invalid_key_team" });
  if (teamId === undefined && requiresExplicitTeam(state, owner)) return writeJson(res, 400, { error: "team_required" });
  const budget = normalizeBudget(body.budget);
  if (!budget.ok) return writeJson(res, 400, { error: "invalid_budget" });
  const issued = await issueApiKey(state.identity, owner, {
    agentLabel: typeof body.agentLabel === "string" ? body.agentLabel : undefined,
    project,
    teamId,
    scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
    budget: budget.budget
  });
  if (!issued) return writeJson(res, 404, { error: "unknown_owner" });
  writeJson(res, 200, { ok: true, secret: issued.secret, key: issued.view });
}

export async function revokeKeyHandler(req: IncomingMessage, res: ServerResponse, state: RuntimeState, user: AuthUser | undefined) {
  if (!state.identity) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const key = state.identity.data.keys[id];
  if (!key) return writeJson(res, 404, { error: "unknown_key" });
  const scope = ownerScope(state, user);
  if (scope && key.ownerUserId !== scope) return writeJson(res, 403, { error: "forbidden" });
  if (scope && !canRevokeOwnKey(user)) return writeJson(res, 403, { error: "key_revoke_forbidden" });
  await revokeKey(state.identity, id);
  writeJson(res, 200, { ok: true });
}

export async function updateKeyHandler(req: IncomingMessage, res: ServerResponse, state: RuntimeState, user: AuthUser | undefined) {
  if (!state.identity) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const key = state.identity.data.keys[id];
  if (!key) return writeJson(res, 404, { error: "unknown_key" });
  const scope = ownerScope(state, user);
  if (scope && key.ownerUserId !== scope) return writeJson(res, 403, { error: "forbidden" });
  const project = typeof body.project === "string" ? cleanKeyProject(body.project) : undefined;
  if (!project) return writeJson(res, 400, { error: "project_required" });
  const previous = { ...key };
  const next = { ...key, project };
  if (typeof body.agentLabel === "string") next.agentLabel = cleanKeyLabel(body.agentLabel);
  if ("teamId" in body) {
    const teamId = validKeyTeam(state, key.ownerUserId, body.teamId);
    if (teamId === false) return writeJson(res, 400, { error: "invalid_key_team" });
    if (teamId === undefined && requiresExplicitTeam(state, key.ownerUserId)) return writeJson(res, 400, { error: "team_required" });
    next.teamId = teamId;
  }
  state.identity.data.keys[id] = next;
  try { await state.identity.save(); } catch {
    state.identity.data.keys[id] = previous;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, { ok: true, key: viewKey(next) });
}

export function usageHandler(_req: IncomingMessage, res: ServerResponse, state: RuntimeState, user: AuthUser | undefined) {
  if (!state.identity) return writeJson(res, 200, { org: emptyUsage(), users: [], teams: [], keys: [] });
  const id = state.identity;
  const scope = ownerScope(state, user);
  const scopedUser = scope ? id.getUser(scope) : undefined;
  const users = id.listUsers()
    .filter((u) => !scope || u.id === scope)
    .map((u) => ({ ...viewUser(u), usage: usageForPeriod(state.usageByUser[userUsageKey(u.id)], u.budget?.period) }));
  const teams = id.listTeams()
    .filter((t) => !scope || readableTeam(scopedUser, t.id, t.managerIds))
    .map((t) => ({ id: t.id, name: t.name, budget: t.budget, usage: usageForPeriod(state.usageByTeam[t.id], t.budget?.period), members: id.usersInTeam(t.id).length }));
  const keys = listKeys(id, scope).map((k) => ({ ...k, usage: usageForPeriod(state.usageByKey[k.id], id.data.keys[k.id]?.budget?.period) }));
  const org = scope ? undefined : { tokens: orgTokensUsed(state, id.data.orgBudget?.period), costEur: orgCostUsed(state, id.data.orgBudget?.period) };
  writeJson(res, 200, { scope: scope ?? "all", org, users, teams, keys });
}

function validKeyTeam(state: RuntimeState, owner: string, value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return false;
  const team = state.identity?.getTeam(value.trim());
  const user = state.identity?.getUser(owner);
  if (isDefaultTeamId(team?.id) && nonDefaultTeamIds(user?.teamIds ?? []).length) return false;
  return team && user?.teamIds.includes(team.id) ? team.id : false;
}

function requiresExplicitTeam(state: RuntimeState, owner: string): boolean {
  const teamIds = state.identity?.getUser(owner)?.teamIds ?? [];
  return nonDefaultTeamIds(teamIds).length > 1;
}

function readableTeam(user: User | undefined, teamId: string, managerIds: string[]): boolean {
  if (!user) return false;
  if (teamId !== DEFAULT_TEAM_ID && user.teamIds.includes(teamId)) return true;
  return user.role === "manager" && managerIds.includes(user.id);
}
