import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { confirmedSavedTokens } from "../../core/src/manifest/audit-metrics.ts";

export type TokenOptimizerObservationSummary = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  providerReportedInputTokens: number;
  providerReportedOutputTokens: number;
  providerUsageAvailable: boolean;
  originalTokens: number;
  forwardedTokens: number;
  cachedTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  savedTokens: number;
  potentialSavedTokens: number;
};

export function observeTokenTraffic(manifests: readonly AuditManifest[]): TokenOptimizerObservationSummary {
  return manifests.reduce<TokenOptimizerObservationSummary>((acc, manifest) => {
    const hasProviderUsage = typeof manifest.upstreamInputTokens === "number" || typeof manifest.upstreamOutputTokens === "number";
    return {
      requests: acc.requests + 1,
      inputTokens: acc.inputTokens + (manifest.upstreamInputTokens ?? 0),
      outputTokens: acc.outputTokens + (manifest.upstreamOutputTokens ?? 0),
      providerReportedInputTokens: acc.providerReportedInputTokens + (manifest.upstreamInputTokens ?? 0),
      providerReportedOutputTokens: acc.providerReportedOutputTokens + (manifest.upstreamOutputTokens ?? 0),
      providerUsageAvailable: acc.providerUsageAvailable || hasProviderUsage,
      originalTokens: acc.originalTokens + (manifest.estimatedOriginalTokens ?? 0),
      forwardedTokens: acc.forwardedTokens + (manifest.estimatedCompressedTokens ?? 0),
      cachedTokens: acc.cachedTokens + (manifest.cachedTokens ?? 0),
      cacheReadTokens: acc.cacheReadTokens + (manifest.cacheReadTokens ?? 0),
      cacheCreationTokens: acc.cacheCreationTokens + (manifest.cacheCreationTokens ?? 0),
      reasoningTokens: acc.reasoningTokens + (manifest.reasoningTokens ?? 0),
      savedTokens: acc.savedTokens + confirmedSavedTokens(manifest),
      potentialSavedTokens: acc.potentialSavedTokens + (manifest.potentialSavedTokens ?? 0)
    };
  }, emptySummary());
}

function emptySummary(): TokenOptimizerObservationSummary {
  return { requests: 0, inputTokens: 0, outputTokens: 0, providerReportedInputTokens: 0, providerReportedOutputTokens: 0, providerUsageAvailable: false, originalTokens: 0, forwardedTokens: 0, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 0 };
}
