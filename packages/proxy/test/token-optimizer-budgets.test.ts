import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBudgetPressure } from "../../plugins/token-optimizer-plugin/budgets.ts";

test("token optimizer budgets are warning-only and expose unavailable limits", () => {
  const summary = summarizeBudgetPressure([
    { upstreamInputTokens: 1200, upstreamOutputTokens: 900 } as any
  ]);
  assert.equal(summary.totalTokens.state, "available");
  assert.equal(summary.totalTokens.value, 2100);
  assert.deepEqual(summary.budgetLimit, { state: "unavailable", reason: "no_plugin_budget_limit_configured" });
  assert.equal(summary.pressure, "low");
  assert.deepEqual(summary.warnings, []);
});

test("token optimizer budget pressure uses realistic volume thresholds", () => {
  const medium = summarizeBudgetPressure([{ upstreamInputTokens: 50_000, upstreamOutputTokens: 0 } as any]);
  const high = summarizeBudgetPressure([{ upstreamInputTokens: 150_000, upstreamOutputTokens: 50_000 } as any]);
  assert.equal(medium.pressure, "medium");
  assert.equal(medium.warnings.includes("budget_pressure_medium"), true);
  assert.equal(high.pressure, "high");
  assert.equal(high.warnings.includes("budget_pressure_high"), true);
});
