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
};

const FIELDS: (keyof UsageMaps)[] = ["usageByAgent", "usageByUser", "usageByProvider", "usageByKey", "usageByTeam"];

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
      if ((FIELDS as string[]).includes(row.id)) {
        try {
          (out as Record<string, unknown>)[row.id] = JSON.parse(row.json);
        } catch {
          throw new UsageSnapshotError(`invalid usage snapshot row: ${row.id}`);
        }
      }
    }
    return out;
  }

  async save(maps: UsageMaps): Promise<void> {
    if (this.closed) return;
    const db = this.handle();
    db.exec("BEGIN");
    try {
      const stmt = db.prepare("INSERT INTO usage(scope, id, json) VALUES('live', ?, ?) ON CONFLICT(scope, id) DO UPDATE SET json = excluded.json");
      for (const field of FIELDS) stmt.run(field, JSON.stringify(maps[field] ?? {}));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async flush(): Promise<void> {
    if (this.closed) return;
    if (!this.flushPromise && this.pending) this.flushPromise = this.runFlush();
    await this.flushPromise;
  }

  async close(): Promise<void> {
    await this.flush().catch(() => {});
    this.closed = true;
    try { this.db?.close(); } catch { /* ignore */ }
    this.db = undefined;
  }

  // Coalesced background flush: marks dirty and flushes at most one at a time.
  schedule(maps: UsageMaps): void {
    if (this.closed) return;
    this.pending = maps;
    if (!this.flushing) queueMicrotask(() => { this.flushPromise ??= this.runFlush().catch(() => {}); });
  }

  private async runFlush(): Promise<void> {
    this.flushing = true;
    try {
      while (this.pending && !this.closed) {
        const next = this.pending;
        this.pending = undefined;
        await this.save(next);
      }
    } finally {
      this.flushing = false;
      this.flushPromise = undefined;
    }
  }
}
