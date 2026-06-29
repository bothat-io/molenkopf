import type { TokenOptimizerBucket } from "./buckets.ts";
import type { TokenOptimizerObservationSummary } from "./observations.ts";
import type { RepeatedContextFinding } from "./repeated-context.ts";
import type { TokenBudgetSummary } from "./budgets.ts";

export type TokenOptimizerRecommendation = {
  id: string;
  kind: "compression_candidate" | "repeated_token_pressure" | "high_prompt_volume" | "budget_warning";
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
  if (observations.potentialSavedTokens > 0 && observations.savedTokens === 0) {
    recommendations.push({
      id: "compression-candidate",
      kind: "compression_candidate",
      severity: "yellow",
      summary: `${observations.potentialSavedTokens} potential tokens were observed in safe compression candidates.`,
      action: "Enable transform mode only after reviewing skip reasons and confirming the savings gate for this project."
    });
  }
  if (repeated.length) {
    const top = repeated[0];
    recommendations.push({
      id: "repeated-token-pressure",
      kind: "repeated_token_pressure",
      severity: "yellow",
      summary: top.confidence === "high" ? `Repeated operational context observed in ${top.endpoint} with matching content fingerprints.` : `Repeated token pressure candidate in ${top.endpoint}; content fingerprints are unavailable.`,
      action: top.confidence === "high" ? "Review the matching operational block and move stable context into a cacheable prefix or project-level reference." : "Review compressor skip reasons and enable safe content fingerprints before treating this as repeated content."
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
