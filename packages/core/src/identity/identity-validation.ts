import { isBudget } from "./budget.ts";
import type { ApiKey, IdentityData, Team, User } from "./types.ts";
import type { PriceTable } from "./pricing.ts";

export type IdentityRow = { id: string; json: string };
export type IdentityMetaRow = { k: string; json: string };

export function parseIdentityRow<T extends { id: string }>(row: IdentityRow, check: (value: unknown) => value is T, label: string): T {
  const value = parseJson(row.json, label);
  if (!check(value)) throw new Error(`invalid ${label} row`);
  if (value.id !== row.id) throw new Error(`${label} id mismatch`);
  return value;
}

export function loadIdentityMeta(data: IdentityData, row: IdentityMetaRow): void {
  const value = parseJson(row.json, `meta ${row.k}`);
  if (row.k === "orgBudget" && isBudget(value)) data.orgBudget = value;
  else if (row.k === "pricing" && isPriceTable(value)) data.pricing = value;
  else throw new Error(`invalid meta row ${row.k}`);
}

export function validateIdentityReferences(data: IdentityData): void {
  for (const user of Object.values(data.users)) for (const id of user.teamIds) if (!data.teams[id]) throw new Error(`user ${user.id} references missing team`);
  for (const team of Object.values(data.teams)) for (const id of team.managerIds) if (!data.users[id]) throw new Error(`team ${team.id} references missing manager`);
  for (const key of Object.values(data.keys)) {
    if (!data.users[key.ownerUserId]) throw new Error(`key ${key.id} references missing owner`);
    if (key.teamId && !data.teams[key.teamId]) throw new Error(`key ${key.id} references missing team`);
  }
}

export function isIdentityUser(value: unknown): value is User {
  const user = value as User;
  return isObject(user) && isUserId(user.id) && typeof user.displayName === "string" && ["admin", "manager", "member"].includes(user.role)
    && stringArray(user.teamIds) && typeof user.createdAt === "string" && (user.password === undefined || isPassword(user.password))
    && (user.loginDisabled === undefined || typeof user.loginDisabled === "boolean") && (user.budget === undefined || isBudget(user.budget))
    && (user.sessionVersion === undefined || (Number.isSafeInteger(user.sessionVersion) && user.sessionVersion >= 0));
}

export function isIdentityTeam(value: unknown): value is Team {
  const team = value as Team;
  return isObject(team) && isSlugId(team.id) && typeof team.name === "string" && (team.allowedProviders === "*" || stringArray(team.allowedProviders))
    && stringArray(team.managerIds) && typeof team.createdAt === "string" && (team.budget === undefined || isBudget(team.budget));
}

export function isIdentityApiKey(value: unknown): value is ApiKey {
  const key = value as ApiKey;
  return isObject(key) && isSlugId(key.id) && typeof key.hash === "string" && typeof key.prefix === "string" && isUserId(key.ownerUserId)
    && typeof key.createdAt === "string" && (key.teamId === undefined || isSlugId(key.teamId)) && (key.scopes === undefined || stringArray(key.scopes))
    && (key.budget === undefined || isBudget(key.budget));
}

function parseJson(json: string, label: string): unknown {
  try { return JSON.parse(json) as unknown; } catch { throw new Error(`invalid ${label} json`); }
}

function isPriceTable(value: unknown): value is PriceTable {
  if (!isObject(value)) return false;
  return Object.values(value).every((entry) => isObject(entry) && nonNegativeNumber(entry.inPerMTok) && nonNegativeNumber(entry.outPerMTok));
}

function isPassword(value: unknown): boolean {
  const password = value as { salt?: unknown; hash?: unknown };
  return isObject(password) && typeof password.salt === "string" && typeof password.hash === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isUserId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(value) || (value.length <= 254 && /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i.test(value));
}

function isSlugId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
