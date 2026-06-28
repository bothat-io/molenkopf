import { openDb, type Db } from "./db.ts";
import { defaultDataDir } from "../storage/local-paths.ts";

// Persistent live-usage snapshot, stored in the SQLite `usage` table so per-key/
// user/team/provider counters survive restarts. Audit remains the raw source of
// truth; this is the fast aggregate. Coalesced background flush.

export type UsageMaps = {
  usageByAgent: Record<string, unknown>;
  usageByUser: Record<string, unknown>;
  usageByProvider: Record<string, unknown>;
  usageByKey: Record<string, unknown>;
  usageByTeam: Record<string, unknown>;
  usageSnapshotCursor?: string;
};

const FIELDS: (keyof UsageMaps)[] = ["usageByAgent", "usageByUser", "usageByProvider", "usageByKey", "usageByTeam"];
const META_ID = "__meta";

export class UsageSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageSnapshotError";
  }
}

export class UsageSnapshotStore {
  private root: string;
  private db?: Db;
  private flushing = false;
  private pending?: UsageMaps;
  private flushPromise?: Promise<void>;
  private lastError?: unknown;
  private closed = false;

  constructor(root = defaultDataDir()) {
    this.root = root;
  }

  private handle(): Db {
    if (!this.db) this.db = openDb(this.root);
    return this.db;
  }

  async load(): Promise<Partial<UsageMaps> | undefined> {
    const db = this.handle();
    const rows = db.prepare("SELECT id, json FROM usage WHERE scope = 'live'").all() as { id: string; json: string }[];
    if (!rows.length) return undefined;
    const out: Partial<UsageMaps> = {};
    for (const row of rows) {
      try {
        if ((FIELDS as string[]).includes(row.id)) {
          (out as Record<string, unknown>)[row.id] = JSON.parse(row.json);
        } else if (row.id === META_ID) {
          const meta = JSON.parse(row.json) as { auditCursor?: unknown };
          if (typeof meta.auditCursor === "string") out.usageSnapshotCursor = meta.auditCursor;
        }
      } catch {
        throw new UsageSnapshotError(`invalid usage snapshot row: ${row.id}`);
      }
    }
    return out;
  }

  async save(maps: UsageMaps): Promise<void> {
    if (this.closed) throw new UsageSnapshotError("usage snapshot store closed");
    const db = this.handle();
    db.exec("BEGIN");
    try {
      const stmt = db.prepare("INSERT INTO usage(scope, id, json) VALUES('live', ?, ?) ON CONFLICT(scope, id) DO UPDATE SET json = excluded.json");
      for (const field of FIELDS) stmt.run(field, JSON.stringify(maps[field] ?? {}));
      stmt.run(META_ID, JSON.stringify({ auditCursor: maps.usageSnapshotCursor }));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async flush(): Promise<void> {
    if (this.lastError) { const error = this.lastError; this.lastError = undefined; throw error; }
    if (this.closed) throw new UsageSnapshotError("usage snapshot store closed");
    if (!this.flushPromise && this.pending) this.flushPromise = this.runFlush();
    await this.flushPromise;
    if (this.lastError) { const error = this.lastError; this.lastError = undefined; throw error; }
  }

  async close(): Promise<void> {
    if (!this.closed) await this.flush();
    this.closed = true;
    try { this.db?.close(); } catch { /* ignore */ }
    this.db = undefined;
  }

  // Coalesced background flush: marks dirty and flushes at most one at a time.
  schedule(maps: UsageMaps): void {
    if (this.closed) return;
    this.pending = maps;
    if (!this.flushing) queueMicrotask(() => {
      this.flushPromise ??= this.runFlush().catch((error) => { this.lastError = error; });
    });
  }

  private async runFlush(): Promise<void> {
    this.flushing = true;
    try {
      while (this.pending && !this.closed) {
        const next = this.pending;
        this.pending = undefined;
        try {
          await this.save(next);
        } catch (error) {
          this.pending = next;
          throw error;
        }
      }
    } finally {
      this.flushing = false;
      this.flushPromise = undefined;
    }
  }
}
