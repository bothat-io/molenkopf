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

test("normalizedManifest preserves safe compression diagnostics only", () => {
  const fakeOpenAiKey = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJK"].join("-");
  const safe = normalizedManifest({
    ...manifest("req_skip_reasons"),
    compressionCandidates: 3,
    compressionSkipped: 2,
    originalBytes: 4000,
    forwardedBytes: 1200,
    compressionRatio: 0.3,
    potentialCompressedItems: 1,
    potentialSavedTokens: 300,
    potentialSavedBytes: 900,
    contentFingerprints: [{ hash: "c".repeat(64), contentKind: "log", originalBytes: 2000, estimatedOriginalTokens: 500, compressed: false, skipReason: "observe_only" }],
    cachedTokens: 800,
    cacheReadTokens: 700,
    cacheCreationTokens: 100,
    reasoningTokens: 64,
    timings: { authMs: 1, compressionMs: 2, totalMs: 3, rawPrompt: 4 },
    staticPrefixHash: "a".repeat(64),
    toolSchemaHash: "b".repeat(64),
    cacheablePrefixBytes: 123,
    hasTimestampNoise: true,
    hasRandomIdNoise: false,
    toolCount: 2,
    toolSchemaBytes: 456,
    toolSchemaTokens: 114,
    skipReasons: {
      source_code_not_compressed: 1,
      [`raw ${fakeOpenAiKey}`]: 2
    },
    contentKindCounts: { log: 2, source_code: 1 },
    effectivePluginIds: ["context-compressor-plugin", fakeOpenAiKey],
    compressorMode: `transform ${fakeOpenAiKey}`,
    zeroSavingsReasons: ["source_code_not_compressed", fakeOpenAiKey]
  });
  const encoded = JSON.stringify(safe);

  assert.equal(safe.compressionCandidates, 3);
  assert.equal(safe.compressionSkipped, 2);
  assert.equal(safe.potentialCompressedItems, 1);
  assert.equal(safe.potentialSavedTokens, 300);
  assert.equal(safe.potentialSavedBytes, 900);
  assert.equal(safe.contentFingerprints?.[0]?.hash, "c".repeat(64));
  assert.equal(safe.cachedTokens, 800);
  assert.equal(safe.cacheReadTokens, 700);
  assert.equal(safe.cacheCreationTokens, 100);
  assert.equal(safe.reasoningTokens, 64);
  assert.deepEqual(safe.timings, { authMs: 1, compressionMs: 2, totalMs: 3 });
  assert.equal(safe.staticPrefixHash, "a".repeat(64));
  assert.equal(safe.toolSchemaHash, "b".repeat(64));
  assert.equal(safe.toolSchemaTokens, 114);
  assert.equal(safe.hasTimestampNoise, true);
  assert.equal(safe.skipReasons?.source_code_not_compressed, 1);
  assert.equal(safe.contentKindCounts?.log, 2);
  assert.deepEqual(safe.effectivePluginIds?.slice(0, 1), ["context-compressor-plugin"]);
  assert.match(safe.compressorMode ?? "", /^transform__REDACTED_SECRET:openai_api_key:sha256:[a-f0-9]{12}_$/);
  assert.equal(safe.zeroSavingsReasons?.[0], "source_code_not_compressed");
  assert.doesNotMatch(encoded, /sk-proj-/);
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
