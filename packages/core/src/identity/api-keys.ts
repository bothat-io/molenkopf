import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IdentityStore } from "./identity-store.ts";
import { viewKey, type ApiKey, type ApiKeyView, type Budget } from "./types.ts";

// Molenkopf-issued API keys. The secret is shown EXACTLY ONCE at creation; only
// its sha256 hash is stored — never the plaintext. Node built-ins only.

export type IssueOptions = { agentLabel?: string; project: string; teamId?: string; scopes?: string[]; budget?: Budget };
export type IssuedKey = { view: ApiKeyView; secret: string };

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function newSecret(): string {
  return `mk_${randomBytes(24).toString("base64url")}`;
}

export async function issueApiKey(store: IdentityStore, ownerUserId: string, opts: IssueOptions): Promise<IssuedKey | undefined> {
  const owner = store.getUser(ownerUserId);
  if (!owner || owner.disabled) return undefined;
  const project = cleanKeyProject(opts.project);
  if (!project) return undefined;
  const teamId = resolveIssueTeam(store, owner, opts.teamId);
  if (teamId === false) return undefined;
  const scopes = cleanScopes(opts.scopes);
  if (scopes === false) return undefined;
  const secret = newSecret();
  const key: ApiKey = {
    id: newKeyId(store),
    hash: hashSecret(secret),
    prefix: secret.slice(0, 8),
    ownerUserId,
    teamId,
    agentLabel: cleanKeyLabel(opts.agentLabel),
    project,
    scopes,
    budget: opts.budget,
    createdAt: new Date().toISOString()
  };
  store.data.keys[key.id] = key;
  try {
    await store.save();
  } catch (error) {
    delete store.data.keys[key.id];
    throw error;
  }
  return { view: viewKey(key), secret };
}

// Looks up a presented secret. Constant-time hash compare; ignores disabled keys.
export function authenticateKey(store: IdentityStore, secret: string | undefined): ApiKey | undefined {
  if (!secret) return undefined;
  const candidate = hashSecret(secret);
  for (const key of Object.values(store.data.keys)) {
    if (key.disabled) continue;
    if (equalHex(candidate, key.hash) && keyUsable(store, key)) return key;
  }
  return undefined;
}

export function listKeys(store: IdentityStore, ownerUserId?: string): ApiKeyView[] {
  return Object.values(store.data.keys)
    .filter((k) => !ownerUserId || k.ownerUserId === ownerUserId)
    .map(viewKey);
}

export async function revokeKey(store: IdentityStore, id: string): Promise<boolean> {
  const key = store.data.keys[id];
  if (!key || key.disabled) return false;
  const previous = key.disabled;
  key.disabled = true;
  try {
    await store.save();
  } catch (error) {
    key.disabled = previous;
    throw error;
  }
  return true;
}

// Records last-used without forcing a disk write on every request (caller flushes).
export function touchKey(store: IdentityStore, key: ApiKey, at = new Date().toISOString()): void {
  key.lastUsedAt = at;
}

function equalHex(a: string, b: string): boolean {
  if (!isSha256Hex(a) || !isSha256Hex(b)) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function newKeyId(store: IdentityStore): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = `key_${randomBytes(5).toString("hex")}`;
    if (!store.data.keys[id]) return id;
  }
  throw new Error("api_key_id_collision");
}

function cleanScopes(scopes: string[] | undefined): string[] | undefined | false {
  if (scopes === undefined) return undefined;
  if (!Array.isArray(scopes)) return false;
  const out: string[] = [];
  for (const scope of scopes) {
    if (typeof scope !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(scope)) return false;
    if (!out.includes(scope)) out.push(scope);
  }
  return out.length ? out : false;
}

function resolveIssueTeam(store: IdentityStore, owner: { teamIds: string[] }, value: string | undefined): string | undefined | false {
  const teamId = value?.trim();
  if (teamId) {
    if (!store.getTeam(teamId) || !owner.teamIds.includes(teamId)) return false;
    if (teamId === "everyone" && billableTeamIds(owner.teamIds).length) return false;
    return teamId;
  }
  const billingTeams = billableTeamIds(owner.teamIds);
  if (billingTeams.length === 1) return billingTeams[0];
  if (billingTeams.length > 1) return false;
  return owner.teamIds.includes("everyone") ? "everyone" : undefined;
}

function keyUsable(store: IdentityStore, key: ApiKey): boolean {
  const owner = store.getUser(key.ownerUserId);
  if (!owner || owner.disabled) return false;
  if (!cleanKeyProject(key.project)) return false;
  if (key.teamId) return Boolean(store.getTeam(key.teamId) && owner.teamIds.includes(key.teamId));
  return billableTeamIds(owner.teamIds).length <= 1;
}

function billableTeamIds(teamIds: string[]): string[] {
  return teamIds.filter((id) => id !== "everyone");
}

export function cleanKeyLabel(value: string | undefined): string | undefined {
  const normalized = value?.replace(/[^\w .@:-]/g, "").trim().slice(0, 64);
  return normalized || undefined;
}

export function cleanKeyProject(value: string | undefined): string | undefined {
  const normalized = value?.replace(/[^\w .@/-]/g, "").trim().slice(0, 80);
  return normalized || undefined;
}
