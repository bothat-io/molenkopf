import test from "node:test";
import assert from "node:assert/strict";
import { safeUnavailableMetrics } from "../../plugins/token-optimizer-plugin/safe-output.ts";

test("token optimizer reports missing cache and cost values as unavailable", () => {
  const metrics = safeUnavailableMetrics();
  assert.deepEqual(metrics.cacheSavings, { state: "unavailable", reason: "cache_metrics_unavailable" });
  assert.deepEqual(metrics.estimatedCostEur, { state: "unavailable", reason: "pricing_unavailable" });
});
