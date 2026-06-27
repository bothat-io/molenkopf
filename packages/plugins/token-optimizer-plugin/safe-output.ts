import type { MetricValue } from "./budgets.ts";

export type TokenOptimizerSafeOutput = {
  cacheSavings: MetricValue;
  estimatedCostEur: MetricValue;
};

export function safeUnavailableMetrics(): TokenOptimizerSafeOutput {
  return {
    cacheSavings: { state: "unavailable", reason: "cache_metrics_unavailable" },
    estimatedCostEur: { state: "unavailable", reason: "pricing_unavailable" }
  };
}
