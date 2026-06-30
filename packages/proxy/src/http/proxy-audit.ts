import { requestCacheDiagnostics } from "../../../core/src/cache/request-cache-diagnostics.ts";
import type { RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import type { PluginContext } from "./plugin-pipeline.ts";

export function buildProxyAudit(ctx: PluginContext, originalBody: string, forwardedBody: string, fingerprintSecret: string): RewriteAudit {
  return {
    compressedItems: ctx.compressedItems,
    estimatedOriginalTokens: estimateTokens(originalBody),
    estimatedCompressedTokens: estimateTokens(forwardedBody),
    estimatedSavedTokens: ctx.savedTokens,
    redactedSecrets: ctx.redactedSecrets,
    retrievalIds: ctx.retrievalIds,
    compressorsUsed: ctx.compressorsUsed,
    warnings: ctx.notes,
    compressionCandidates: ctx.compressionCandidates,
    compressionSkipped: ctx.compressionSkipped,
    skipReasons: ctx.skipReasons,
    contentKindCounts: ctx.contentKindCounts,
    originalBytes: ctx.originalBytes,
    forwardedBytes: ctx.forwardedBytes,
    compressionRatio: ctx.compressionRatio,
    potentialCompressedItems: ctx.potentialCompressedItems,
    potentialSavedTokens: ctx.potentialSavedTokens,
    potentialSavedBytes: ctx.potentialSavedBytes,
    protectedSourceTokens: ctx.protectedSourceTokens,
    protectedDiffTokens: ctx.protectedDiffTokens,
    contentFingerprints: ctx.contentFingerprints,
    effectivePluginIds: ctx.effectivePluginIds,
    compressorMode: ctx.compressorMode,
    zeroSavingsReasons: ctx.zeroSavingsReasons,
    ...requestCacheDiagnostics(forwardedBody, fingerprintSecret)
  };
}
