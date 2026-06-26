import { IDENTITY_SCHEMA_VERSION, emptyIdentity, type ApiKey, type IdentityData, type Team, type User } from "./types.ts";
import { markIdentityDbUnavailable, openDb, type Db } from "./db.ts";
import { isIdentityApiKey, isIdentityTeam, isIdentityUser, loadIdentityMeta, parseIdentityRow, validateIdentityData, type IdentityMetaRow, type IdentityRow } from "./identity-validation.ts";
import { defaultDataDir } from "../storage/local-paths.ts";

// Identity store backed by real SQLite (node:sqlite, a built-in — no dependency).
// Keeps an in-memory `data` mirror for fast logic; `save()` syncs it to the DB in
// one transaction. Same public interface as before, so all callers are unchanged.

export class IdentityStore {
  private root: string;
  private db?: Db;
  private closed = false;
  private ephemeralUserIds = new Set<string>();
  data: IdentityData = emptyIdentity();

  constructor(root = defaultDataDir()) {
    this.root = root;
  }

  private handle(): Db {
    if (!this.db) this.db = openDb(this.root);
    return this.db;
  }

  async load(): Promise<IdentityData> {
    const db = this.handle();
    const data = emptyIdentity();
    try {
      for (const row of db.prepare("SELECT id, json FROM users").all() as IdentityRow[]) data.users[row.id] = parseIdentityRow(row, isIdentityUser, "user");
      for (const row of db.prepare("SELECT id, json FROM teams").all() as IdentityRow[]) data.teams[row.id] = parseIdentityRow(row, isIdentityTeam, "team");
      for (const row of db.prepare("SELECT id, json FROM api_keys").all() as IdentityRow[]) data.keys[row.id] = parseIdentityRow(row, isIdentityApiKey, "api_key");
      for (const row of db.prepare("SELECT k, json FROM meta").all() as IdentityMetaRow[]) loadIdentityMeta(data, row);
      normalizeDefaultTeam(data);
      data.schemaVersion = IDENTITY_SCHEMA_VERSION;
      validateIdentityData(data);
      this.data = data;
      return this.data;
    } catch (error) {
      try { this.db?.close(); } catch { /* ignore */ }
      this.db = undefined;
      markIdentityDbUnavailable(this.root, error instanceof Error ? error.message : "invalid identity data");
      throw new Error("identity database unavailable: invalid identity data");
    }
  }

  async save(): Promise<void> {
    if (this.closed) throw new Error("identity_store_closed");
    const persisted = persistedIdentity(this.data, this.ephemeralUserIds);
    validateIdentityData(persisted);
    const db = this.handle();
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM users; DELETE FROM teams; DELETE FROM api_keys; DELETE FROM meta;");
      const u = db.prepare("INSERT INTO users(id, json) VALUES(?, ?)");
      for (const user of Object.values(persisted.users)) u.run(user.id, JSON.stringify(user));
      const t = db.prepare("INSERT INTO teams(id, json) VALUES(?, ?)");
      for (const team of Object.values(persisted.teams)) t.run(team.id, JSON.stringify(team));
      const k = db.prepare("INSERT INTO api_keys(id, hash, owner_user_id, disabled, json) VALUES(?, ?, ?, ?, ?)");
      for (const key of Object.values(persisted.keys)) k.run(key.id, key.hash, key.ownerUserId, key.disabled ? 1 : 0, JSON.stringify(key));
      const m = db.prepare("INSERT INTO meta(k, json) VALUES(?, ?)");
      if (persisted.orgBudget) m.run("orgBudget", JSON.stringify(persisted.orgBudget));
      if (persisted.pricing) m.run("pricing", JSON.stringify(persisted.pricing));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  // ---- users ----
  listUsers(): User[] { return Object.values(this.data.users); }
  getUser(id: string): User | undefined { return this.data.users[id]; }
  markEphemeralUser(id: string): void { this.ephemeralUserIds.add(id); }
  async putUser(user: User): Promise<User> {
    const previous = this.data;
    this.data = cloneIdentity(previous);
    try {
      this.data.users[user.id] = normalizeUser({ ...user, teamIds: [...(user.teamIds ?? [])] }, this.data);
      await this.save();
      return this.data.users[user.id];
    } catch (error) {
      this.data = previous;
      throw error;
    }
  }
  async removeUser(id: string): Promise<boolean> {
    if (!this.data.users[id]) return false;
    const previous = this.data;
    this.data = cloneIdentity(previous);
    try {
      delete this.data.users[id];
      for (const key of Object.values(this.data.keys)) if (key.ownerUserId === id) delete this.data.keys[key.id];
      for (const team of Object.values(this.data.teams)) team.managerIds = team.managerIds.filter((managerId) => managerId !== id);
      await this.save();
      return true;
    } catch (error) {
      this.data = previous;
      throw error;
    }
  }

  // ---- teams ----
  listTeams(): Team[] { return Object.values(this.data.teams); }
  getTeam(id: string): Team | undefined { return this.data.teams[id]; }
  async putTeam(team: Team): Promise<Team> {
    const previous = this.data;
    this.data = cloneIdentity(previous);
    try {
      this.data.teams[team.id] = { ...team, managerIds: [...team.managerIds] };
      if (team.id === "everyone") normalizeDefaultTeam(this.data);
      await this.save();
      return this.data.teams[team.id];
    } catch (error) {
      this.data = previous;
      throw error;
    }
  }
  async removeTeam(id: string): Promise<boolean> {
    if (id === "everyone") return false;
    if (!this.data.teams[id]) return false;
    const previous = this.data;
      this.data = cloneIdentity(previous);
      try {
        delete this.data.teams[id];
        for (const user of Object.values(this.data.users)) user.teamIds = user.teamIds.filter((t) => t !== id);
      for (const key of Object.values(this.data.keys)) if (key.teamId === id) {
        key.disabled = true;
        delete key.teamId;
      }
      await this.save();
      return true;
    } catch (error) {
      this.data = previous;
      throw error;
    }
  }

  usersInTeam(teamId: string): User[] { return teamId === "everyone" && this.data.teams.everyone ? this.listUsers() : this.listUsers().filter((u) => u.teamIds.includes(teamId)); }

  close(): void {
    this.closed = true;
    try { this.db?.close(); } catch { /* ignore */ }
    this.db = undefined;
  }
}

function normalizeDefaultTeam(data: IdentityData): void {
  if (!data.teams.everyone) return;
  for (const user of Object.values(data.users)) normalizeUser(user, data);
}

function normalizeUser(user: User, data: IdentityData): User {
  user.teamIds = Array.isArray(user.teamIds) ? user.teamIds.filter((id) => Boolean(data.teams[id])) : [];
  if (data.teams.everyone && !user.teamIds.includes("everyone")) user.teamIds = ["everyone", ...user.teamIds];
  return user;
}

function persistedTeam(team: Team, ephemeralUserIds: Set<string>): Team {
  return { ...team, managerIds: team.managerIds.filter((id) => !ephemeralUserIds.has(id)) };
}

function persistedIdentity(data: IdentityData, ephemeralUserIds: Set<string>): IdentityData {
  const persisted = cloneIdentity(data);
  for (const id of ephemeralUserIds) delete persisted.users[id];
  for (const key of Object.values(persisted.keys)) if (ephemeralUserIds.has(key.ownerUserId)) delete persisted.keys[key.id];
  for (const team of Object.values(persisted.teams)) persisted.teams[team.id] = persistedTeam(team, ephemeralUserIds);
  return persisted;
}

function cloneIdentity(data: IdentityData): IdentityData {
  return JSON.parse(JSON.stringify(data)) as IdentityData;
}

export type { ApiKey };
