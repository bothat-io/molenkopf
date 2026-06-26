import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditStore, type AuditManifest } from "../src/manifest/audit-store.ts";

test("normalizes dirty audit manifests on read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-read-safe-"));
  const auditDir = join(dir, "audit");
  await mkdir(auditDir, { recursive: true });
  const rawKey = `mk_${"a".repeat(32)}`;
  await writeFile(join(auditDir, "2026-01-01T00-00-00-000Z-dirty.json"), JSON.stringify({
    ...manifest("dirty"),
    path: "/v1/responses?api_key=raw-query-secret",
    targetHost: "api.example.test Authorization: Bearer raw-target-token",
    client: { id: rawKey, label: "Authorization: Bearer raw-client-token", source: "api_key", keyId: rawKey },
    warnings: ["password=hunter2"]
  }), "utf8");

  const store = new AuditStore(dir);
  const listed = await store.list();
  const paged = await store.listPage({ limit: 1 });
  const latest = await store.latest();
  for (const item of [listed[0], paged.items[0], latest]) {
    const encoded = JSON.stringify(item);
    assert.equal(item?.path, "/v1/responses");
    assert.doesNotMatch(encoded, /raw-query-secret|raw-target-token|raw-client-token|hunter2|mk_aaaa/);
    assert.match(encoded, /REDACTED_SECRET/);
  }
  await rm(dir, { recursive: true, force: true });
});

function manifest(requestId: string): AuditManifest {
  return {
    requestId,
    timestamp: "2026-01-01T00:00:00.000Z",
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
