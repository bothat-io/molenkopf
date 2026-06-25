import type { IncomingMessage, ServerResponse } from "node:http";
import { hashPasswordAsync, passwordTooLong } from "../../../core/src/auth/password.ts";
import { normalizeBudget } from "../../../core/src/identity/budget.ts";
import { viewUser, type Budget, type KeyPermissions, type Role, type Team, type User } from "../../../core/src/identity/types.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { isValidSlugId, isValidUserId } from "./identity-id.ts";
import { isWeakPassword } from "./password-policy.ts";

export function listIdentity(_req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const id = state.identity;
  if (!id) return writeJson(res, 200, { users: [], teams: [], pricing: {}, orgBudget: undefined });
  writeJson(res, 200, {
    users: id.listUsers().map(viewUser),
    teams: id.listTeams(),
    pricing: id.data.pricing ?? {},
    orgBudget: id.data.orgBudget
  });
}
export async function putIdentityUser(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const id = state.identity;
  if (!id) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const userId = typeof body.id === "string" ? body.id.trim() : "";
  if (!isValidUserId(userId)) return writeJson(res, 400, { error: "invalid_user_id" });
  const existing = id.getUser(userId);
  if (isWeakPassword(body.password)) return writeJson(res, 400, { error: "weak_password" });
  const rawPassword = typeof body.password === "string" && body.password ? body.password : "";
  if (rawPassword && passwordTooLong(rawPassword)) return writeJson(res, 400, { error: "password_too_long" });
  const password = rawPassword ? await hashPasswordAsync(rawPassword) : existing?.password;
  const disabled = typeof body.disabled === "boolean" ? body.disabled : existing?.disabled;
  const loginDisabled = password ? false : typeof body.loginDisabled === "boolean" ? body.loginDisabled : (existing?.loginDisabled ?? true);
  if (!password && loginDisabled === false) return writeJson(res, 400, { error: "password_required" });
  const teamIds = userTeamIds(body, existing?.teamIds ?? [], id);
  if (teamIds === false) return writeJson(res, 400, { error: "invalid_team_id" });
  const budget = nextBudget(body, existing?.budget);
  if (budget === false) return writeJson(res, 400, { error: "invalid_budget" });
  const user: User = {
    id: userId,
    displayName: typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : userId,
    role: body.role === undefined ? (existing?.role ?? "member") : parseRole(body.role),
    password,
    loginDisabled,
    teamIds,
    keyPermissions: parseKeyPermissions(body.keyPermissions, existing?.keyPermissions),
    budget,
    disabled,
    sessionVersion: nextSessionVersion(existing, { passwordChanged: Boolean(rawPassword), role: parseRole(body.role ?? existing?.role), disabled, loginDisabled }),
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  if (existing && isLastEnabledAdminWithPassword(id, existing) && !enabledAdminWithPassword(user)) {
    return writeJson(res, 409, { error: "last_admin_required" });
  }
  const saved = await id.putUser(user);
  writeJson(res, 200, { ok: true, user: viewUser(saved) });
}
export async function removeIdentityUser(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const id = state.identity;
  if (!id) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const userId = typeof body.id === "string" ? body.id : "";
  const existing = id.getUser(userId);
  if (existing && isLastEnabledAdminWithPassword(id, existing)) return writeJson(res, 409, { error: "last_admin_required" });
  const ok = await id.removeUser(userId);
  writeJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: "unknown_user" });
}
export async function putIdentityTeam(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const id = state.identity;
  if (!id) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const teamId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : generatedTeamId(id, typeof body.name === "string" ? body.name : "");
  if (!isValidSlugId(teamId)) return writeJson(res, 400, { error: "invalid_team_id" });
  const existing = id.getTeam(teamId);
  const allowed = body.allowedProviders;
  const budget = nextBudget(body, existing?.budget);
  if (budget === false) return writeJson(res, 400, { error: "invalid_budget" });
  const allowedProviders = providerList(allowed, existing?.allowedProviders ?? "*", state);
  if (allowedProviders === false) return writeJson(res, 400, { error: "invalid_provider" });
  const managerIds = managerList(body.managerIds, existing?.managerIds ?? [], id);
  if (managerIds === false) return writeJson(res, 400, { error: "invalid_manager" });
  const team: Team = {
    id: teamId,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : teamId,
    allowedProviders,
    managerIds,
    budget,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  if (Array.isArray(body.memberIds)) {
    const memberIds = memberList(body.memberIds, id);
    if (memberIds === false) return writeJson(res, 400, { error: "invalid_member" });
    id.data.teams[team.id] = team;
    for (const user of id.listUsers()) {
      const current = new Set(user.teamIds);
      if (team.id === "everyone" || memberIds.has(user.id)) current.add(team.id);
      else current.delete(team.id);
      user.teamIds = [...current];
    }
    await id.save();
  } else {
    await id.putTeam(team);
  }
  writeJson(res, 200, { ok: true, team });
}
export async function removeIdentityTeam(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const id = state.identity;
  if (!id) return writeJson(res, 400, { error: "identity_unavailable" });
  const body = await readJson(req);
  const teamId = typeof body.id === "string" ? body.id : "";
  if (teamId === "everyone") return writeJson(res, 409, { error: "cannot_remove_default_team" });
  const ok = await id.removeTeam(teamId);
  writeJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: "unknown_team" });
}
function parseRole(value: unknown): Role { return value === "admin" ? "admin" : value === "manager" ? "manager" : "member"; }
function nextSessionVersion(existing: User | undefined, next: { passwordChanged: boolean; role: Role; disabled?: boolean; loginDisabled?: boolean }): number {
  if (!existing) return 0;
  const changed = next.passwordChanged || existing.role !== next.role || existing.disabled !== next.disabled || existing.loginDisabled !== next.loginDisabled;
  return (existing.sessionVersion ?? 0) + (changed ? 1 : 0);
}
function isLastEnabledAdminWithPassword(store: { listUsers(): User[] }, user: User): boolean {
  if (!enabledAdminWithPassword(user)) return false;
  return !store.listUsers().some((item) => item.id !== user.id && enabledAdminWithPassword(item));
}
function enabledAdminWithPassword(user: User): boolean {
  return user.role === "admin" && user.disabled !== true && Boolean(user.password);
}
function nextBudget(body: Record<string, unknown>, existing: Budget | undefined): Budget | undefined | false {
  if (!Object.hasOwn(body, "budget")) return existing;
  const parsed = normalizeBudget(body.budget);
  return parsed.ok ? parsed.budget : false;
}
function userTeamIds(body: Record<string, unknown>, existing: string[], store: { getTeam(id: string): Team | undefined }): string[] | false {
  if (!Array.isArray(body.teamIds)) return existing;
  const out: string[] = [];
  for (const value of body.teamIds) {
    if (typeof value !== "string" || !store.getTeam(value)) return false;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
function managerList(value: unknown, existing: string[], store: { getUser(id: string): User | undefined }): string[] | false {
  if (!Array.isArray(value)) return existing;
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !store.getUser(id)) return false;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
function memberList(value: unknown[], store: { getUser(id: string): User | undefined }): Set<string> | false {
  const out = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !store.getUser(id)) return false;
    out.add(id);
  }
  return out;
}
function providerList(value: unknown, existing: Team["allowedProviders"], state: RuntimeState): Team["allowedProviders"] | false {
  if (value === undefined) return existing;
  if (value === "*") return "*";
  if (!Array.isArray(value)) return false;
  const out: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !state.providers.some((provider) => provider.id === id && provider.enabled !== false)) return false;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
function parseKeyPermissions(value: unknown, existing: KeyPermissions | undefined): KeyPermissions | undefined {
  if (!value || typeof value !== "object") return existing;
  const permissions = value as Record<string, unknown>;
  return { create: permissions.create !== false, revoke: permissions.revoke !== false };
}
function generatedTeamId(store: { getTeam(id: string): Team | undefined }, name: string): string {
  const base = slugFromName(name || "team");
  if (!store.getTeam(base)) return base;
  for (let index = 2; index < 100; index++) {
    const id = `${base}-${index}`;
    if (!store.getTeam(id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}
function slugFromName(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  if (isValidSlugId(slug)) return slug;
  const fallback = slug ? `team-${slug}` : "team";
  return fallback.slice(0, 64);
}
