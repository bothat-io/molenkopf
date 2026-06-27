import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenOptimizerWorkspace } from "./TokenOptimizerWorkspace";

describe("TokenOptimizerWorkspace", () => {
  it("renders token optimizer summaries and unavailable values", () => {
    const html = renderToString(<TokenOptimizerWorkspace
      data={{
        observations: { requests: 4, inputTokens: 900 },
        budgets: { pressure: "high" },
        estimatedCostEur: { state: "unavailable", reason: "pricing_unavailable" },
        cacheSavings: { state: "unavailable", reason: "cache_metrics_unavailable" },
        recommendations: [{ id: "r1", kind: "budget_warning", severity: "yellow", summary: "Budget pressure is high" }]
      }}
    />);
    expect(html).toContain("Token Optimizer");
    expect(html).toContain("Budget pressure:");
    expect(html).toContain("high");
    expect(html).toContain("pricing_unavailable");
    expect(html).toContain("Budget pressure is high");
  });
});
