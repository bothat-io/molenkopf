import { readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultDataDir } from "../storage/local-paths.ts";
import { chmodPrivateSync, ensurePrivateDirSync, PRIVATE_FILE_MODE } from "../storage/private-state.ts";
import { purgeChildDir } from "../storage/purge-dir.ts";
import { isAuditManifest, normalizedManifest } from "./audit-safety.ts";

export type AuditManifest = {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  targetHost: string;
  providerId?: string;
  client?: { id: string; label: string; source: "user" | "agent" | "api_key" | "anonymous"; userId?: string; agentId?: string; teamIds?: string[]; keyId?: string; project?: string };
  compressedItems: number;
  estimatedOriginalTokens: number;
  estimatedCompressedTokens: number;
  estimatedSavedTokens: number;
  redactedSecrets: number;
  retrievalIds: string[];
  compressorsUsed: string[];
  warnings: string[];
  statusCode?: number;
  durationMs?: number;
  upstreamInputTokens?: number;
  upstreamOutputTokens?: number;
};
export type AuditRetention = { maxFiles?: number; maxBytes?: number; maxAgeMs?: number };
export type AuditStoreOptions = { retention?: AuditRetention; now?: () => Date };
export type AuditPage = { items: AuditManifest[]; nextCursor?: string; skippedCorrupt: number };

export class AuditCursorError extends Error {
  constructor() { super("invalid audit cursor"); this.name = "AuditCursorError"; }
}

export class AuditStore {
  private root: string;
  private retention: AuditRetention;
  private now: () => Date;

  constructor(root = defaultDataDir(), options: AuditStoreOptions = {}) {
    this.root = root; this.retention = options.retention ?? {}; this.now = options.now ?? (() => new Date());
  }

  async write(manifest: AuditManifest): Promise<void> {
    const safe = normalizedManifest(manifest);
    safe.path = safePath(safe.path);
    const dir = join(this.root, "audit");
    ensurePrivateDirSync(dir);
    const name = `${safe.timestamp.replace(/[:.]/g, "-")}-${safeName(safe.requestId)}.json`;
    const tmp = join(dir, `tmp-${process.pid}-${Date.now()}-${safeName(safe.requestId)}.json.tmp`);
    const final = join(dir, name);
    writeFileSync(tmp, JSON.stringify(safe, null, 2), privateWriteOptions());
    chmodPrivateSync(tmp, PRIVATE_FILE_MODE);
    renameSync(tmp, final);
    chmodPrivateSync(final, PRIVATE_FILE_MODE);
    await this.enforceRetention(dir);
  }

  async latest(): Promise<AuditManifest | undefined> {
    return this.latestFast();
  }

  async latestFast(): Promise<AuditManifest | undefined> {
    return (await this.listPage({ limit: 1, newestFirst: true })).items[0];
  }

  async listPage(options: { limit?: number; cursor?: string; newestFirst?: boolean; filter?: (item: AuditManifest) => boolean } = {}): Promise<AuditPage> {
    const dir = join(this.root, "audit");
    const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 100)));
    let files = await auditFiles(dir);
    if (options.newestFirst) files = files.reverse();
    const start = options.cursor ? cursorIndex(files, options.cursor) + 1 : 0;
    const items: AuditManifest[] = [];
    let skippedCorrupt = 0, index = Math.max(0, start), lastFile: string | undefined;
    for (; index < files.length && items.length < limit; index++) {
      const file = files[index];
      const item = await readManifest(dir, file);
      if (item && (!options.filter || options.filter(item))) { items.push(item); lastFile = file; } else if (!item) { skippedCorrupt++; await quarantine(dir, file); }
    }
    return { items, skippedCorrupt, nextCursor: index < files.length && lastFile ? encodeCursor(lastFile) : undefined };
  }

  async list(): Promise<AuditManifest[]> {
    const dir = join(this.root, "audit");
    const files = await auditFiles(dir);
    const out: AuditManifest[] = [];
    for (const file of files) {
      const item = await readManifest(dir, file);
      if (item) out.push(item); else await quarantine(dir, file);
    }
    return out;
  }

  async purgeAll(): Promise<void> {
    await purgeChildDir(this.root, "audit");
  }

  private async enforceRetention(dir: string): Promise<void> {
    if (!this.retention.maxAgeMs && !this.retention.maxFiles && !this.retention.maxBytes) return;
    const files = await auditFiles(dir).catch(() => []);
    const now = this.now().getTime();
    const entries = await Promise.all(files.map(async (file) => ({ file, size: await fileSize(join(dir, file)), ageMs: now - fileTime(file) })));
    let kept = entries.filter((entry) => !this.retention.maxAgeMs || entry.ageMs <= this.retention.maxAgeMs);
    for (const entry of entries) if (!kept.includes(entry)) await rm(join(dir, entry.file), { force: true });
    if (this.retention.maxFiles && kept.length > this.retention.maxFiles) {
      for (const entry of kept.slice(0, kept.length - this.retention.maxFiles)) await rm(join(dir, entry.file), { force: true });
      kept = kept.slice(-this.retention.maxFiles);
    }
    while (this.retention.maxBytes && kept.reduce((sum, entry) => sum + entry.size, 0) > this.retention.maxBytes && kept.length) {
      const [entry, ...rest] = kept;
      await rm(join(dir, entry.file), { force: true });
      kept = rest;
    }
  }
}

async function auditFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((file) => file.endsWith(".json") && !file.endsWith(".corrupt.json")).sort();
  } catch (err) {
    if (isFsCode(err, "ENOENT")) return [];
    throw err;
  }
}

async function readManifest(dir: string, file: string): Promise<AuditManifest | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(dir, file), "utf8");
  } catch (err) {
    if (isFsCode(err, "ENOENT")) return undefined;
    throw err;
  }
  try {
    const value = JSON.parse(raw) as unknown;
    return isAuditManifest(value) ? value : undefined;
  } catch (err) {
    if (err instanceof SyntaxError) return undefined;
    throw err;
  }
}

function isFsCode(err: unknown, code: string): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === code);
}

async function quarantine(dir: string, file: string): Promise<void> {
  await rename(join(dir, file), join(dir, `${file}.corrupt`)).catch(() => {});
}

function safePath(path: string): string {
  try {
    return new URL(path, "http://local").pathname || "/";
  } catch {
    return path.split("?")[0] || "/";
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._:-]/gi, "_").slice(0, 96) || "request";
}

function encodeCursor(file: string): string {
  return Buffer.from(JSON.stringify({ file }), "utf8").toString("base64url");
}

function cursorIndex(files: string[], cursor: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { file?: unknown };
    if (typeof parsed.file !== "string") throw new Error("bad");
    const index = files.indexOf(parsed.file);
    if (index < 0) throw new Error("bad");
    return index;
  } catch {
    throw new AuditCursorError();
  }
}

function fileTime(file: string): number {
  const stamp = file.slice(0, 24).replace(/T(\d\d)-(\d\d)-(\d\d)-(\d\d\d)Z/, "T$1:$2:$3.$4Z");
  return Date.parse(stamp) || 0;
}

async function fileSize(path: string): Promise<number> {
  try { return (await stat(path)).size; } catch { return 0; }
}

function privateWriteOptions(): { mode: number } | undefined {
  return process.platform === "win32" ? undefined : { mode: PRIVATE_FILE_MODE };
}
