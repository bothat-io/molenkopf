import test from "node:test";
import assert from "node:assert/strict";
import { observeTokenTraffic } from "../../plugins/token-optimizer-plugin/observations.ts";

test("token optimizer summarizes request and token observations", () => {
  const summary = observeTokenTraffic([
    manifest(120, 40, 30),
    manifest(80, 20, 10)
  ]);
  assert.deepEqual(summary, {
    requests: 2,
    inputTokens: 200,
    outputTokens: 60,
    savedTokens: 40
  });
});

function manifest(input: number, output: number, saved: number) {
  return { upstreamInputTokens: input, upstreamOutputTokens: output, estimatedSavedTokens: saved } as any;
}
