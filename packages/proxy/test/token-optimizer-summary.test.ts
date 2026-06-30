import test from "node:test";
import assert from "node:assert/strict";
import { observeTokenTraffic } from "../../plugins/token-optimizer-plugin/observations.ts";

test("token optimizer summarizes request and token observations", () => {
  const summary = observeTokenTraffic([
    manifest(120, 40, 180, 120, 60),
    manifest(80, 20, 90, 90, 0)
  ]);
  assert.deepEqual(summary, {
    requests: 2,
    inputTokens: 200,
    outputTokens: 60,
    providerReportedInputTokens: 200,
    providerReportedOutputTokens: 60,
    providerUsageAvailable: true,
    originalTokens: 270,
    forwardedTokens: 210,
    cachedTokens: 50,
    cacheReadTokens: 40,
    cacheCreationTokens: 10,
    reasoningTokens: 7,
    savedTokens: 60,
    potentialSavedTokens: 25
  });
});

test("token optimizer marks provider usage unavailable when requests lack provider token fields", () => {
  const summary = observeTokenTraffic([
    { estimatedOriginalTokens: 500, estimatedCompressedTokens: 400 } as any
  ]);
  assert.equal(summary.requests, 1);
  assert.equal(summary.providerReportedInputTokens, 0);
  assert.equal(summary.providerReportedOutputTokens, 0);
  assert.equal(summary.providerUsageAvailable, false);
});

function manifest(input: number, output: number, original: number, forwarded: number, saved: number) {
  return {
    upstreamInputTokens: input,
    upstreamOutputTokens: output,
    compressedItems: saved > 0 ? 1 : 0,
    estimatedOriginalTokens: original,
    estimatedCompressedTokens: forwarded,
    estimatedSavedTokens: saved,
    potentialSavedTokens: saved > 0 ? 25 : 0,
    cachedTokens: saved > 0 ? 50 : 0,
    cacheReadTokens: saved > 0 ? 40 : 0,
    cacheCreationTokens: saved > 0 ? 10 : 0,
    reasoningTokens: saved > 0 ? 7 : 0
  } as any;
}
