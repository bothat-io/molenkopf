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
  protectedSourceTokens?: number;
  protectedDiffTokens?: number;
  zeroSavingsReasons?: Record<string, number>;
  effectivePluginIds?: string[];
  compressorModes?: string[];
  compressionStatus?: string;
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
      potentialSavedTokens: acc.potentialSavedTokens + (manifest.potentialSavedTokens ?? 0),
      protectedSourceTokens: acc.protectedSourceTokens + (manifest.protectedSourceTokens ?? 0),
      protectedDiffTokens: acc.protectedDiffTokens + (manifest.protectedDiffTokens ?? 0),
      zeroSavingsReasons: addReasons(acc.zeroSavingsReasons, manifest.zeroSavingsReasons),
      effectivePluginIds: addUnique(acc.effectivePluginIds, manifest.effectivePluginIds),
      compressorModes: addUnique(acc.compressorModes, manifest.compressorMode ? [manifest.compressorMode] : []),
      compressionStatus: statusOf(acc, manifest)
    };
  }, emptySummary());
}

function emptySummary(): TokenOptimizerObservationSummary {
  return { requests: 0, inputTokens: 0, outputTokens: 0, providerReportedInputTokens: 0, providerReportedOutputTokens: 0, providerUsageAvailable: false, originalTokens: 0, forwardedTokens: 0, cachedTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, savedTokens: 0, potentialSavedTokens: 0, protectedSourceTokens: 0, protectedDiffTokens: 0, zeroSavingsReasons: {}, effectivePluginIds: [], compressorModes: [], compressionStatus: "no-candidate" };
}

function addReasons(current: Record<string, number>, reasons?: readonly string[]): Record<string, number> {
  const next = { ...current };
  for (const reason of reasons ?? []) next[reason] = (next[reason] ?? 0) + 1;
  return next;
}

function addUnique(current: string[], values?: readonly string[]): string[] {
  return [...new Set([...current, ...(values ?? [])])].slice(0, 20);
}

function statusOf(current: TokenOptimizerObservationSummary, manifest: AuditManifest): string {
  if ((manifest.compressorMode === "transform" || current.compressorModes.includes("transform")) && current.savedTokens + confirmedSavedTokens(manifest) > 0) return "active-transformer";
  if (manifest.zeroSavingsReasons?.includes("observe_only") || manifest.compressorMode === "observe") return "observe-only";
  if ((manifest.compressionCandidates ?? 0) > 0 && confirmedSavedTokens(manifest) === 0) return "ineffective";
  if ((manifest.compressionSkipped ?? 0) > 0 || manifest.zeroSavingsReasons?.length) return "blocked";
  if (current.requests > 0 || manifest.compressionCandidates === 0) return current.compressionStatus;
  return "no-candidate";
}
