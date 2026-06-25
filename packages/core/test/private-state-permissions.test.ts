import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditStore } from "../src/manifest/audit-store.ts";
import { IdentityStore } from "../src/identity/identity-store.ts";
import { RetrievalStore } from "../src/store/retrieval-store.ts";

test("sensitive core state is private under permissive umask", async () => withPermissiveUmask(async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-private-core-"));
  const identity = new IdentityStore(root);
  await identity.load();
  await identity.save();
  identity.close();

  const audit = new AuditStore(root);
  await audit.write({
    requestId: "req_1", timestamp: "2026-01-01T00:00:00.000Z", method: "POST",
    path: "/v1", targetHost: "local", compressedItems: 0, estimatedOriginalTokens: 0,
    estimatedCompressedTokens: 0, estimatedSavedTokens: 0, redactedSecrets: 0,
    retrievalIds: [], compressorsUsed: [], warnings: []
  });

  const retrieval = new RetrievalStore(root);
  const saved = await retrieval.save("secret-ish excerpt", { contentKind: "log", compressedBytes: 1, compressorName: "test", redacted: true });
  const hash = saved.meta.hash;

  await assertMode(root, 0o700);
  await assertMode(join(root, "molenkopf.db"), 0o600);
  for (const name of ["molenkopf.db-wal", "molenkopf.db-shm"]) if (existsSync(join(root, name))) await assertMode(join(root, name), 0o600);
  await assertMode(join(root, "audit"), 0o700);
  await assertMode(join(root, "audit", "2026-01-01T00-00-00-000Z-req_1.json"), 0o600);
  const retrievalDir = join(root, "store", "sha256", hash.slice(0, 2), hash.slice(2, 4));
  await assertMode(retrievalDir, 0o700);
  await assertMode(join(retrievalDir, `${hash}.txt`), 0o600);
  await assertMode(join(retrievalDir, `${hash}.json`), 0o600);
  await rm(root, { recursive: true, force: true });
}));

async function withPermissiveUmask(run: () => Promise<void>): Promise<void> {
  if (process.platform === "win32") return run();
  const previous = process.umask(0);
  try { await run(); } finally { process.umask(previous); }
}

async function assertMode(path: string, expected: number): Promise<void> {
  if (process.platform === "win32") return;
  assert.equal((await stat(path)).mode & 0o777, expected, path);
}
