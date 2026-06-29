import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenBuckets } from "../../plugins/token-optimizer-plugin/buckets.ts";

test("token optimizer buckets include project, savings, percent, and latest timestamp", () => {
  const buckets = buildTokenBuckets([
    manifest("alpha", "POST", "/v1/responses", 800, 100, 1000, 700, 300, "2026-01-01T00:00:00.000Z"),
    manifest("alpha", "POST", "/v1/responses", 200, 50, 240, 240, 0, "2026-01-02T00:00:00.000Z"),
    manifest("beta", "POST", "/v1/chat/completions", 1500, 100, 1500, 1500, 0, "2026-01-01T00:00:00.000Z")
  ]);
  const alpha = buckets.find((item) => item.project === "alpha");
  assert.ok(alpha);
  assert.equal(alpha.savedTokens, 300);
  assert.equal(alpha.savedPercent, 24);
  assert.equal(alpha.latestAt, "2026-01-02T00:00:00.000Z");
  assert.equal(buckets[0].label, "POST /v1/chat/completions");
});

function manifest(project: string, method: string, path: string, input: number, output: number, original: number, forwarded: number, saved: number, timestamp: string) {
  return { client: { project }, method, path, timestamp, upstreamInputTokens: input, upstreamOutputTokens: output, compressedItems: saved > 0 ? 1 : 0, estimatedOriginalTokens: original, estimatedCompressedTokens: forwarded, estimatedSavedTokens: saved } as any;
}
