import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest } from "../src/http/request-finish.ts";

test("buildManifest copies safe provider cache and reasoning usage metrics", () => {
  const manifest = buildManifest(
    "req_usage",
    "POST",
    "/v1/responses",
    "http://127.0.0.1:1/v1/responses",
    "openai",
    200,
    12,
    { id: "key:test", label: "key:test", source: "api_key" },
    {
      compressedItems: 0,
      estimatedOriginalTokens: 1000,
      estimatedCompressedTokens: 1000,
      estimatedSavedTokens: 0,
      potentialCompressedItems: 1,
      potentialSavedTokens: 250,
      potentialSavedBytes: 1000,
      contentFingerprints: [{ hash: "a".repeat(64), contentKind: "log", originalBytes: 1000, estimatedOriginalTokens: 250, compressed: false, skipReason: "observe_only" }],
      redactedSecrets: 0,
      retrievalIds: [],
      compressorsUsed: [],
      warnings: []
    },
    { inputTokens: 1000, outputTokens: 200, cachedTokens: 800, cacheReadTokens: 700, cacheCreationTokens: 100, reasoningTokens: 64 },
    undefined,
    { authMs: 1, compressionMs: 2, totalMs: 3 }
  );
  assert.equal(manifest.cachedTokens, 800);
  assert.equal(manifest.cacheReadTokens, 700);
  assert.equal(manifest.cacheCreationTokens, 100);
  assert.equal(manifest.reasoningTokens, 64);
  assert.deepEqual(manifest.timings, { authMs: 1, compressionMs: 2, totalMs: 3 });
  assert.equal(manifest.potentialCompressedItems, 1);
  assert.equal(manifest.potentialSavedTokens, 250);
  assert.equal(manifest.potentialSavedBytes, 1000);
  assert.equal(manifest.contentFingerprints?.[0]?.hash, "a".repeat(64));
});
