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
  assert.equal(summary.pressure, "high");
  assert.equal(summary.warnings.includes("budget_pressure_high"), true);
});
