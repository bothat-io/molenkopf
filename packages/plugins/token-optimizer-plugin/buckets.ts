import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { confirmedSavedTokens } from "../../core/src/manifest/audit-metrics.ts";

export type TokenOptimizerBucket = {
  id: string;
  label: string;
  project: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  originalTokens: number;
  forwardedTokens: number;
  savedTokens: number;
  potentialSavedTokens: number;
  savedPercent: number;
  latestAt?: string;
};

export function buildTokenBuckets(manifests: readonly AuditManifest[]): TokenOptimizerBucket[] {
  const buckets = new Map<string, TokenOptimizerBucket>();
  for (const manifest of manifests) {
    const project = manifest.client?.project ?? "unattributed";
    const key = `${manifest.method} ${manifest.path}|${project}`;
    const current = buckets.get(key) ?? {
      id: key,
      label: `${manifest.method} ${manifest.path}`,
      project,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      originalTokens: 0,
      forwardedTokens: 0,
      savedTokens: 0,
      potentialSavedTokens: 0,
      savedPercent: 0
    };
    current.requests += 1;
    current.inputTokens += manifest.upstreamInputTokens ?? 0;
    current.outputTokens += manifest.upstreamOutputTokens ?? 0;
    current.originalTokens += manifest.estimatedOriginalTokens ?? 0;
    current.forwardedTokens += manifest.estimatedCompressedTokens ?? 0;
    current.savedTokens += confirmedSavedTokens(manifest);
    current.potentialSavedTokens += manifest.potentialSavedTokens ?? 0;
    current.savedPercent = current.originalTokens > 0 ? Math.round((current.savedTokens / current.originalTokens) * 100) : 0;
    current.latestAt = latest(current.latestAt, manifest.timestamp);
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => b.inputTokens - a.inputTokens).slice(0, 10);
}

function latest(current: string | undefined, next: string): string {
  return !current || next > current ? next : current;
}
