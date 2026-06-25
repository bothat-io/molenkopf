import { DatabaseSync } from "node:sqlite";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultDataDir } from "../storage/local-paths.ts";
import { chmodPrivateSync, ensurePrivateDirSync, PRIVATE_FILE_MODE } from "../storage/private-state.ts";

// Real SQLite persistence via Node's BUILT-IN node:sqlite (no npm dependency —
// honors the "core/proxy: built-ins only" invariant). One database file holds
// identity (users/teams/api_keys/meta) and usage. Run with --experimental-sqlite.

export type Db = DatabaseSync;

export function openDb(root = defaultDataDir()): Db {
  ensurePrivateDirSync(root);
  const path = join(root, "molenkopf.db");
  const marker = join(root, "molenkopf.db.quarantined");
  if (existsSync(marker)) throw new Error("identity database unavailable: quarantined database marker exists");
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path);
    db.exec("PRAGMA busy_timeout = 4000; PRAGMA journal_mode = WAL;");
    ensureSchema(db);
    repairSqlitePermissions(root);
    return db;
  } catch (error) {
    try { db?.close(); } catch { /* ignore */ }
    if (isOperationalSqliteError(error)) throw new Error("identity database unavailable: busy");
    try { if (existsSync(path)) renameSync(path, `${path}.corrupt.${Date.now()}`); } catch { /* best effort */ }
    try { writeFileSync(marker, `${new Date().toISOString()} ${error instanceof Error ? error.message : String(error)}\n`, privateWriteOptions()); chmodPrivateSync(marker, PRIVATE_FILE_MODE); } catch { /* best effort */ }
    throw new Error("identity database unavailable");
  }
}

function isOperationalSqliteError(error: unknown): boolean {
  const item = error as { code?: unknown; message?: unknown };
  return /SQLITE_(BUSY|LOCKED)/.test(String(item.code ?? "")) || /database is (locked|busy)/i.test(String(item.message ?? ""));
}

export function markIdentityDbUnavailable(root = defaultDataDir(), reason: string): void {
  ensurePrivateDirSync(root);
  const marker = join(root, "molenkopf.db.quarantined");
  try { writeFileSync(marker, `${new Date().toISOString()} ${reason}\n`, privateWriteOptions()); chmodPrivateSync(marker, PRIVATE_FILE_MODE); } catch { /* best effort */ }
}

export function repairSqlitePermissions(root = defaultDataDir()): void {
  for (const name of ["molenkopf.db", "molenkopf.db-wal", "molenkopf.db-shm"]) {
    const file = join(root, name);
    if (existsSync(file)) chmodPrivateSync(file, PRIVATE_FILE_MODE);
  }
}

function privateWriteOptions(): { mode: number } | undefined {
  return process.platform === "win32" ? undefined : { mode: PRIVATE_FILE_MODE };
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY, hash TEXT, owner_user_id TEXT, disabled INTEGER DEFAULT 0, json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_user_id);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage (scope TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (scope, id));
  `);
}
