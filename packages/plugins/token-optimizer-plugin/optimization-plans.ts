import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import type { TokenBudgetSummary } from "./budgets.ts";
import type { TokenOptimizerObservationSummary } from "./observations.ts";
import type { RepeatedContextFinding } from "./repeated-context.ts";

export type OptimizationPlan = {
  id: string;
  kind: "enable_context_compressor" | "enable_content_fingerprints" | "tune_context_compressor" | "stabilize_prompt_cache" | "review_tool_schema_pressure" | "review_output_limit";
  confidence: "low" | "medium";
  summary: string;
  action: string;
  requiresConfirmation: true;
  evidence: Record<string, number | string>;
};

const OUTPUT_HEAVY_TOKENS = 1000;

export function buildOptimizationPlans(
  manifests: readonly AuditManifest[],
  observations: TokenOptimizerObservationSummary,
  repeated: readonly RepeatedContextFinding[],
  budgets: TokenBudgetSummary
): OptimizationPlan[] {
  const plans: OptimizationPlan[] = [];
  const skipped = sum(manifests, "compressionSkipped");
  const candidates = sum(manifests, "compressionCandidates");
  if (observations.potentialSavedTokens > 0 && observations.savedTokens === 0) plans.push(plan("enable_context_compressor", "medium", "Safe compression candidates were observed, but transform mode has not confirmed savings yet.", "Enable context-compressor transform mode for this project only if the configured savings gate remains above threshold.", { candidates, potentialSavedTokens: observations.potentialSavedTokens }));
  if (repeated.some((item) => item.confidence === "low")) plans.push(plan("enable_content_fingerprints", "low", "Repeated token pressure needs content fingerprints before it can be treated as repeated content.", "Enable HMAC content fingerprints for operational blocks, then review high-confidence repeats before applying cache or retrieval policy.", { requests: repeated[0].requests, observedTokens: repeated[0].repeatedInputTokens }));
  if (candidates > 0 && skipped > 0) plans.push(plan("tune_context_compressor", "medium", "Compression candidates are being skipped by current policy thresholds.", "Review context-compressor thresholds and allowed kinds; apply only if confirmed savings remain above the configured gate.", { candidates, skipped, savedTokens: observations.savedTokens }));
  if (manifests.some((item) => item.hasTimestampNoise || item.hasRandomIdNoise) && observations.cacheReadTokens === 0) plans.push(plan("stabilize_prompt_cache", "medium", "Volatile prefix noise is present and no provider cache reads were observed.", "Move Molenkopf-owned timestamps or request ids out of cacheable prefixes where safe; do not rewrite user prompts.", { requests: observations.requests, cacheReadTokens: observations.cacheReadTokens }));
  const toolSchemaTokens = sum(manifests, "toolSchemaTokens");
  if (toolSchemaTokens >= 500) plans.push(plan("review_tool_schema_pressure", budgets.pressure === "high" ? "medium" : "low", "Tool schemas are a meaningful part of observed input pressure.", "Stabilize tool ordering and remove duplicate Molenkopf-owned schema wrappers; do not minify provider-native schemas without evals.", { toolSchemaTokens }));
  if (observations.providerReportedOutputTokens >= OUTPUT_HEAVY_TOKENS && observations.providerReportedOutputTokens > observations.providerReportedInputTokens) plans.push(plan("review_output_limit", "medium", "Provider output tokens are heavier than observed input tokens.", "Review max output, response format, and tool-call verbosity; do not mutate traffic automatically.", { requests: observations.requests, inputTokens: observations.providerReportedInputTokens, outputTokens: observations.providerReportedOutputTokens }));
  return plans;
}

function plan(kind: OptimizationPlan["kind"], confidence: OptimizationPlan["confidence"], summary: string, action: string, evidence: OptimizationPlan["evidence"]): OptimizationPlan {
  return { id: `plan:${kind}`, kind, confidence, summary, action, requiresConfirmation: true, evidence };
}

function sum(manifests: readonly AuditManifest[], key: keyof AuditManifest): number {
  return manifests.reduce((total, item) => total + (typeof item[key] === "number" ? item[key] as number : 0), 0);
}
