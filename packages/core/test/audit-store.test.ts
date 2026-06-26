import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditCursorError, AuditStore } from "../src/manifest/audit-store.ts";
import { normalizedManifest } from "../src/manifest/audit-safety.ts";

test("writes audit manifest without secret-bearing fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-"));
  const store = new AuditStore(dir);
  await store.write({
    requestId: "req_1",
    timestamp: "2026-01-01T00:00:00.000Z",
    method: "POST",
    path: "/v1/responses?api_key=sk-secret",
    targetHost: "api.openai.com",
    compressedItems: 1,
    estimatedOriginalTokens: 100,
    estimatedCompressedTokens: 10,
    estimatedSavedTokens: 90,
    redactedSecrets: 1,
    retrievalIds: ["molenkopf://sha256/abc"],
    compressorsUsed: ["log"],
    warnings: [],
    statusCode: 200,
    durationMs: 3
  });
  const latest = await store.latest();
  assert.equal(latest?.requestId, "req_1");
  assert.equal(latest?.path, "/v1/responses");
  assert.doesNotMatch(JSON.stringify(latest), /Authorization|sk-/);
  await store.purgeAll();
  assert.deepEqual(await store.list(), []);
  await rm(dir, { recursive: true, force: true });
});

test("redacts and bounds free-form audit manifest fields at write time", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-safe-"));
  const store = new AuditStore(dir);
  const apiKey = `mk_${"a".repeat(32)}`;
  await store.write({
    ...manifest("req_safe", "2026-01-01T00:00:00.000Z"),
    path: "/v1/responses?token=path-secret",
    targetHost: "api.example.test Authorization: Bearer raw-token",
    client: {
      id: apiKey,
      label: "Authorization: Bearer raw-client-token",
      source: "user",
      userId: "Authorization: Bearer raw-user-token",
      agentId: apiKey,
      teamIds: ["token=team-secret"],
      keyId: apiKey,
      project: "password=project-secret"
    },
    warnings: ["password=hunter2", "plain-warning"]
  });
  const latest = await store.latest();
  const encoded = JSON.stringify(latest);
  assert.equal(latest?.path, "/v1/responses");
  assert.doesNotMatch(encoded, /raw-token|raw-client-token|raw-user-token|hunter2|path-secret|team-secret|project-secret|mk_aaaa/);
  assert.match(encoded, /REDACTED_SECRET|plain-warning/);
  await rm(dir, { recursive: true, force: true });
});

test("normalizes path and client metadata outside AuditStore.write", () => {
  const apiKey = `mk_${"b".repeat(32)}`;
  const safe = normalizedManifest({
    ...manifest("req_direct", "2026-01-01T00:00:00.000Z"),
    path: "/v1/messages?api_key=raw-query-secret",
    client: { id: apiKey, label: "ok", source: "api_key", keyId: apiKey, project: "secret=project-value" }
  });
  const encoded = JSON.stringify(safe);
  assert.equal(safe.path, "/v1/messages");
  assert.doesNotMatch(encoded, /raw-query-secret|project-value|mk_bbbb/);
  assert.match(encoded, /REDACTED_SECRET/);
});

test("normalizes audit retrieval and compressor arrays", () => {
  const validRef = `molenkopf://sha256/${"a".repeat(64)}`;
  const safe = normalizedManifest({
    ...manifest("req_arrays", "2026-01-01T00:00:00.000Z"),
    retrievalIds: [`mk_${"c".repeat(32)}`, validRef],
    compressorsUsed: ["password=hunter2", "embedded-log"],
    warnings: []
  });
  const encoded = JSON.stringify(safe);
  assert.deepEqual(safe.retrievalIds, [validRef]);
  assert.equal(safe.compressorsUsed.length, 2);
  assert.doesNotMatch(encoded, /mk_cccc|hunter2/);
  assert.match(encoded, /REDACTED_SECRET|embedded-log/);
});

test("lists audit manifests by bounded pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-page-"));
  const store = new AuditStore(dir);
  for (let i = 0; i < 5; i++) {
    await store.write({
      requestId: `req_${i}`,
      timestamp: `2026-01-01T00:00:0${i}.000Z`,
      method: "POST",
      path: "/v1/responses",
      targetHost: "api.openai.com",
      compressedItems: 0,
      estimatedOriginalTokens: 0,
      estimatedCompressedTokens: 0,
      estimatedSavedTokens: 0,
      redactedSecrets: 0,
      retrievalIds: [],
      compressorsUsed: [],
      warnings: []
    });
  }
  const first = await store.listPage({ limit: 2 });
  assert.deepEqual(first.items.map((item) => item.requestId), ["req_0", "req_1"]);
  assert.ok(first.nextCursor);
  const second = await store.listPage({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.requestId), ["req_2", "req_3"]);
  assert.equal((await store.latestFast())?.requestId, "req_4");
  await rm(dir, { recursive: true, force: true });
});

test("skips and quarantines corrupt audit records without breaking reads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-corrupt-"));
  const store = new AuditStore(dir);
  await store.write(manifest("req_1", "2026-01-01T00:00:00.000Z"));
  await writeFile(join(dir, "audit", "2026-01-01T00-00-01-000Z-bad.json"), "{", "utf8");
  await store.write(manifest("req_2", "2026-01-01T00:00:02.000Z"));
  const page = await store.listPage({ limit: 10 });
  assert.deepEqual(page.items.map((item) => item.requestId), ["req_1", "req_2"]);
  assert.equal(page.skippedCorrupt, 1);
  assert.ok((await readdir(join(dir, "audit"))).some((file) => file.endsWith(".corrupt")));
  await rm(dir, { recursive: true, force: true });
});

test("surfaces audit storage outages instead of reporting an empty audit log", async () => {
  const root = await mkdtemp(join(tmpdir(), "audit-outage-"));
  await writeFile(join(root, "audit"), "file blocks audit directory", "utf8");
  const store = new AuditStore(root);

  await assert.rejects(store.listPage({ limit: 10 }));
  await assert.rejects(store.list());

  await rm(root, { recursive: true, force: true });
});

test("rejects invalid audit cursors instead of restarting from the first page", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-cursor-"));
  const store = new AuditStore(dir);
  await store.write(manifest("req_1", "2026-01-01T00:00:00.000Z"));
  await assert.rejects(store.listPage({ cursor: "not-a-cursor" }), AuditCursorError);
  await rm(dir, { recursive: true, force: true });
});

test("ignores crash-simulated temp files and enforces retention quotas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-retention-"));
  const store = new AuditStore(dir, { retention: { maxFiles: 2, maxAgeMs: 2500, maxBytes: 10000 }, now: () => new Date("2026-01-01T00:00:05.000Z") });
  await mkdir(join(dir, "audit"), { recursive: true });
  await writeFile(join(dir, "audit", "audit-temp.json.tmp"), "{", "utf8");
  for (let i = 0; i < 5; i++) await store.write(manifest(`req_${i}`, `2026-01-01T00:00:0${i}.000Z`));
  const items = await store.list();
  assert.deepEqual(items.map((item) => item.requestId), ["req_3", "req_4"]);
  const byteDir = await mkdtemp(join(tmpdir(), "audit-byte-retention-"));
  const byteStore = new AuditStore(byteDir, { retention: { maxBytes: 1 } });
  await byteStore.write(manifest("req_big", "2026-01-01T00:00:00.000Z"));
  assert.deepEqual(await byteStore.list(), []);
  await rm(byteDir, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
});

test("applies audit filters before pagination limits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-filter-page-"));
  const store = new AuditStore(dir);
  await store.write({ ...manifest("bob", "2026-01-01T00:00:00.000Z"), client: { id: "user:bob", label: "Bob", source: "user", userId: "bob" } });
  for (let i = 1; i <= 210; i++) {
    await store.write({ ...manifest(`ana_${i}`, `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(3, "0")}Z`), client: { id: "user:ana", label: "Ana", source: "user", userId: "ana" } });
  }
  const page = await store.listPage({ limit: 1, newestFirst: true, filter: (item) => item.client?.userId === "bob" });
  assert.deepEqual(page.items.map((item) => item.requestId), ["bob"]);
  await rm(dir, { recursive: true, force: true });
});

function manifest(requestId: string, timestamp: string) {
  return {
    requestId,
    timestamp,
    method: "POST",
    path: "/v1/responses",
    targetHost: "api.openai.com",
    compressedItems: 0,
    estimatedOriginalTokens: 0,
    estimatedCompressedTokens: 0,
    estimatedSavedTokens: 0,
    redactedSecrets: 0,
    retrievalIds: [],
    compressorsUsed: [],
    warnings: []
  };
}
