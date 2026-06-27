import test from "node:test";
import assert from "node:assert/strict";
import { buildRecommendations } from "../../plugins/token-optimizer-plugin/recommendations.ts";

test("token optimizer creates recommendation summaries from repeated context and budget pressure", () => {
  const recommendations = buildRecommendations(
    { requests: 3, inputTokens: 1200, outputTokens: 300, savedTokens: 0 },
    [{ id: "a", label: "POST /v1/responses", requests: 3, inputTokens: 700, outputTokens: 100 }],
    [{ project: "alpha", endpoint: "POST /v1/responses", requests: 2, repeatedInputTokens: 600 }],
    {
      totalTokens: { state: "available", value: 1500, source: "provider_reported" },
      budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" },
      pressure: "high",
      warnings: ["budget_pressure_high"]
    }
  );
  assert.equal(recommendations.length >= 2, true);
  assert.equal(recommendations.some((item) => item.kind === "repeated_context"), true);
  assert.equal(recommendations.some((item) => item.kind === "budget_warning"), true);
});
