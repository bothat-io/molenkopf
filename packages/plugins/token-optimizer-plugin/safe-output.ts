import type { MetricValue } from "./budgets.ts";
import type { TokenOptimizerObservationSummary } from "./observations.ts";

export type TokenOptimizerSafeOutput = {
  providerCacheTokens: MetricValue;
  estimatedCostEur: MetricValue;
};

export function safeUnavailableMetrics(): TokenOptimizerSafeOutput {
  return buildSafeOutput();
}

export function buildSafeOutput(observations?: Pick<TokenOptimizerObservationSummary, "cachedTokens" | "cacheReadTokens">): TokenOptimizerSafeOutput {
  const cacheTokens = (observations?.cachedTokens ?? 0) + (observations?.cacheReadTokens ?? 0);
  return {
    providerCacheTokens: cacheTokens > 0 ? { state: "available", value: cacheTokens, source: "provider_reported" } : { state: "unavailable", reason: "cache_metrics_unavailable" },
    estimatedCostEur: { state: "unavailable", reason: "pricing_unavailable" }
  };
}
