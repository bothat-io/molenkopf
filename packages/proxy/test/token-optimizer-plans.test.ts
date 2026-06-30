import test from "node:test";
import assert from "node:assert/strict";
import { buildOptimizationPlans } from "../../plugins/token-optimizer-plugin/optimization-plans.ts";

test("token optimizer builds admin-confirmed optimization plans from evidence", () => {
  const plans = buildOptimizationPlans(
    [
      { compressionCandidates: 4, compressedItems: 1, compressionSkipped: 3, skipReasons: { below_min_saved_percent: 2 }, hasTimestampNoise: true, cacheReadTokens: 0, toolSchemaTokens: 800 } as any
    ],
    { requests: 3, inputTokens: 1200, outputTokens: 300, providerReportedInputTokens: 1200, providerReportedOutputTokens: 300, providerUsageAvailable: true, originalTokens: 1500, forwardedTokens: 1300, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 200, potentialSavedTokens: 0 },
    [{ project: "alpha", endpoint: "POST /v1/responses", requests: 3, repeatedInputTokens: 1200, averageInputTokens: 400, confidence: "low", reason: "content_fingerprints_unavailable" }],
    { totalTokens: { state: "available", value: 1500, source: "provider_reported" }, budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" }, pressure: "low", warnings: [] }
  );
  assert.equal(plans.every((plan) => plan.requiresConfirmation), true);
  assert.ok(plans.some((plan) => plan.kind === "enable_content_fingerprints"));
  assert.ok(plans.some((plan) => plan.kind === "stabilize_prompt_cache"));
  assert.ok(plans.some((plan) => plan.kind === "review_tool_schema_pressure"));
});

test("token optimizer plans transform enablement from observed potential savings", () => {
  const plans = buildOptimizationPlans(
    [{ compressionCandidates: 2, compressionSkipped: 2 } as any],
    { requests: 2, inputTokens: 0, outputTokens: 0, providerReportedInputTokens: 0, providerReportedOutputTokens: 0, providerUsageAvailable: false, originalTokens: 800, forwardedTokens: 800, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 300 },
    [],
    { totalTokens: { state: "unavailable", reason: "usage_unavailable" }, budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" }, pressure: "low", warnings: [] }
  );
  const plan = plans.find((item) => item.kind === "enable_context_compressor");
  assert.ok(plan);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.evidence.potentialSavedTokens, 300);
});

test("token optimizer plans output-heavy review without mutating traffic", () => {
  const plans = buildOptimizationPlans(
    [],
    { requests: 4, inputTokens: 900, outputTokens: 1800, providerReportedInputTokens: 900, providerReportedOutputTokens: 1800, providerUsageAvailable: true, originalTokens: 900, forwardedTokens: 900, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 0 },
    [],
    { totalTokens: { state: "available", value: 2700, source: "provider_reported" }, budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" }, pressure: "low", warnings: [] }
  );
  const plan = plans.find((item) => item.kind === "review_output_limit");
  assert.ok(plan);
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.evidence.outputTokens, 1800);
  assert.match(plan.action, /do not mutate traffic automatically/i);
});
