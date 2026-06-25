import type { RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";

export function withBudgetWarnings(audit: RewriteAudit | undefined, warnings: string[]): RewriteAudit | undefined {
  if (!warnings.length) return audit;
  const base = audit ?? { compressedItems: 0, estimatedOriginalTokens: 0, estimatedCompressedTokens: 0, estimatedSavedTokens: 0, redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [] };
  return { ...base, warnings: [...warnings, ...(base.warnings ?? [])] };
}
