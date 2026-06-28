import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";

export type TokenOptimizerObservationSummary = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
};

export function observeTokenTraffic(manifests: readonly AuditManifest[]): TokenOptimizerObservationSummary {
  return manifests.reduce<TokenOptimizerObservationSummary>((acc, manifest) => ({
    requests: acc.requests + 1,
    inputTokens: acc.inputTokens + (manifest.upstreamInputTokens ?? 0),
    outputTokens: acc.outputTokens + (manifest.upstreamOutputTokens ?? 0),
    savedTokens: acc.savedTokens + (manifest.estimatedSavedTokens ?? 0)
  }), { requests: 0, inputTokens: 0, outputTokens: 0, savedTokens: 0 });
}
