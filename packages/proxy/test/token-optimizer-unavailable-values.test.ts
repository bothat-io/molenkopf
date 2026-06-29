import test from "node:test";
import assert from "node:assert/strict";
import { buildSafeOutput, safeUnavailableMetrics } from "../../plugins/token-optimizer-plugin/safe-output.ts";

test("token optimizer reports missing cache and cost values as unavailable", () => {
  const metrics = safeUnavailableMetrics();
  assert.deepEqual(metrics.providerCacheTokens, { state: "unavailable", reason: "cache_metrics_unavailable" });
  assert.deepEqual(metrics.estimatedCostEur, { state: "unavailable", reason: "pricing_unavailable" });
});

test("token optimizer reports provider cache tokens when available", () => {
  const metrics = buildSafeOutput({ cachedTokens: 100, cacheReadTokens: 50 } as any);
  assert.deepEqual(metrics.providerCacheTokens, { state: "available", value: 150, source: "provider_reported" });
  assert.deepEqual(metrics.estimatedCostEur, { state: "unavailable", reason: "pricing_unavailable" });
});
