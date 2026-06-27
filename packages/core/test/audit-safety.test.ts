import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditStore } from "../src/manifest/audit-store.ts";
import { normalizedManifest } from "../src/manifest/audit-safety.ts";

test("normalizedManifest drops unknown root and client fields", () => {
  const safe = normalizedManifest({
    ...manifest("req_unknown"),
    rawPrompt: "full raw prompt",
    rawResponse: "full raw response",
    authorization: "Bearer raw-authorization",
    cookie: "sid=raw-cookie",
    headers: { authorization: "Bearer nested-header" },
    client: {
      id: "client-1",
      label: "client",
      source: "api_key",
      token: "raw-client-token",
      rawPrompt: "nested raw prompt"
    }
  } as any);
  const encoded = JSON.stringify(safe);
  assert.equal((safe as any).rawPrompt, undefined);
  assert.equal((safe as any).headers, undefined);
  assert.equal((safe.client as any).token, undefined);
  assert.doesNotMatch(encoded, /full raw prompt|full raw response|raw-authorization|raw-cookie|nested-header|raw-client-token|nested raw prompt/);
});

test("AuditStore.write persists only normalized audit fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-unknown-"));
  const store = new AuditStore(dir);
  await store.write({
    ...manifest("req_store_unknown"),
    rawPrompt: "persisted raw prompt",
    rawResponse: "persisted raw response",
    authorization: "Bearer persisted-authorization",
    cookie: "sid=persisted-cookie",
    client: {
      id: "client-2",
      label: "client",
      source: "user",
      token: "persisted-client-token"
    }
  } as any);
  const latest = await store.latest();
  const encoded = JSON.stringify(latest);
  assert.equal((latest as any).rawResponse, undefined);
  assert.equal((latest?.client as any).token, undefined);
  assert.doesNotMatch(encoded, /persisted raw prompt|persisted raw response|persisted-authorization|persisted-cookie|persisted-client-token/);
  await rm(dir, { recursive: true, force: true });
});

function manifest(requestId: string) {
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
