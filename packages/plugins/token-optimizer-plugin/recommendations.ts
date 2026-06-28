import type { TokenOptimizerBucket } from "./buckets.ts";
import type { TokenOptimizerObservationSummary } from "./observations.ts";
import type { RepeatedContextFinding } from "./repeated-context.ts";
import type { TokenBudgetSummary } from "./budgets.ts";

export type TokenOptimizerRecommendation = {
  id: string;
  kind: "repeated_context" | "high_prompt_volume" | "budget_warning";
  severity: "green" | "yellow";
  summary: string;
  action: string;
};

export function buildRecommendations(
  observations: TokenOptimizerObservationSummary,
  buckets: readonly TokenOptimizerBucket[],
  repeated: readonly RepeatedContextFinding[],
  budgets: TokenBudgetSummary
): TokenOptimizerRecommendation[] {
  const recommendations: TokenOptimizerRecommendation[] = [];
  if (repeated.length) {
    recommendations.push({
      id: "repeated-context",
      kind: "repeated_context",
      severity: "yellow",
      summary: `Repeated context detected in ${repeated[0].endpoint}`,
      action: "Move stable instructions into a shared system prompt, profile, or retrieval note."
    });
  }
  if (buckets[0] && buckets[0].inputTokens >= 500) {
    recommendations.push({
      id: "high-prompt-volume",
      kind: "high_prompt_volume",
      severity: "yellow",
      summary: `High prompt volume observed for ${buckets[0].label}`,
      action: "Inspect this route for repeated boilerplate, oversized tool context, or unused history."
    });
  }
  if (budgets.pressure !== "low" && observations.requests > 0) {
    recommendations.push({
      id: "budget-warning",
      kind: "budget_warning",
      severity: "yellow",
      summary: `Budget pressure is ${budgets.pressure}`,
      action: "Set a project budget limit and review high-volume buckets before changing routing."
    });
  }
  return recommendations;
}
