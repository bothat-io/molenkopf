import test from "node:test";
import assert from "node:assert/strict";
import { buildRecommendations } from "../../plugins/token-optimizer-plugin/recommendations.ts";

test("token optimizer creates conservative token-pressure recommendations and budget warnings", () => {
  const recommendations = buildRecommendations(
    { requests: 3, inputTokens: 1200, outputTokens: 300, providerReportedInputTokens: 1200, providerReportedOutputTokens: 300, originalTokens: 1300, forwardedTokens: 1200, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 0 },
    [{ id: "a", label: "POST /v1/responses", project: "alpha", requests: 3, inputTokens: 700, outputTokens: 100, originalTokens: 800, forwardedTokens: 700, savedTokens: 100, potentialSavedTokens: 0, savedPercent: 13 }],
    [{ project: "alpha", endpoint: "POST /v1/responses", requests: 3, repeatedInputTokens: 1200, averageInputTokens: 400, confidence: "low", reason: "content_fingerprints_unavailable" }],
    {
      totalTokens: { state: "available", value: 1500, source: "provider_reported" },
      budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" },
      pressure: "high",
      warnings: ["budget_pressure_high"]
    }
  );
  assert.equal(recommendations.length >= 2, true);
  const repeated = recommendations.find((item) => item.kind === "repeated_token_pressure");
  assert.ok(repeated);
  assert.match(repeated.summary, /candidate/i);
  assert.doesNotMatch(repeated.summary, /detected/i);
  assert.equal(recommendations.some((item) => item.kind === "budget_warning"), true);
  assert.equal(recommendations.every((item) => item.action.length > 0), true);
});

test("token optimizer reports potential compression without claiming confirmed savings", () => {
  const recommendations = buildRecommendations(
    { requests: 1, inputTokens: 0, outputTokens: 0, providerReportedInputTokens: 0, providerReportedOutputTokens: 0, originalTokens: 900, forwardedTokens: 900, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 300 },
    [], [],
    { totalTokens: { state: "unavailable", reason: "usage_unavailable" }, budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" }, pressure: "low", warnings: [] }
  );
  const candidate = recommendations.find((item) => item.kind === "compression_candidate");
  assert.ok(candidate);
  assert.match(candidate.summary, /potential/i);
  assert.doesNotMatch(candidate.summary, /saved/i);
});

test("token optimizer describes fingerprint-backed repeated context as high evidence", () => {
  const recommendations = buildRecommendations(
    { requests: 2, inputTokens: 0, outputTokens: 0, providerReportedInputTokens: 0, providerReportedOutputTokens: 0, originalTokens: 0, forwardedTokens: 0, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 0 },
    [], [{ project: "alpha", endpoint: "POST /v1/responses", requests: 2, repeatedInputTokens: 500, averageInputTokens: 250, confidence: "high", reason: "matching_content_fingerprint" }],
    { totalTokens: { state: "unavailable", reason: "usage_unavailable" }, budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" }, pressure: "low", warnings: [] }
  );
  assert.match(recommendations[0].summary, /matching content fingerprints/i);
  assert.doesNotMatch(recommendations[0].action, /enable safe content fingerprints/i);
});

test("token optimizer describes retrieval-backed repeated context as high evidence", () => {
  const recommendations = buildRecommendations(
    { requests: 2, inputTokens: 0, outputTokens: 0, providerReportedInputTokens: 0, providerReportedOutputTokens: 0, originalTokens: 0, forwardedTokens: 0, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 0 },
    [], [{ project: "alpha", endpoint: "POST /v1/responses", requests: 2, repeatedInputTokens: 500, averageInputTokens: 250, confidence: "high", reason: "matching_retrieval_id" }],
    { totalTokens: { state: "unavailable", reason: "usage_unavailable" }, budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" }, pressure: "low", warnings: [] }
  );
  assert.match(recommendations[0].summary, /matching retrieval ids/i);
  assert.doesNotMatch(recommendations[0].summary, /fingerprints/i);
  assert.doesNotMatch(recommendations[0].action, /enable safe content fingerprints/i);
});
