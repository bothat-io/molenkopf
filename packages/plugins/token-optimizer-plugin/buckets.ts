import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";

export type TokenOptimizerBucket = {
  id: string;
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export function buildTokenBuckets(manifests: readonly AuditManifest[]): TokenOptimizerBucket[] {
  const buckets = new Map<string, TokenOptimizerBucket>();
  for (const manifest of manifests) {
    const project = manifest.client?.project ?? "unattributed";
    const key = `${manifest.method} ${manifest.path}|${project}`;
    const current = buckets.get(key) ?? {
      id: key,
      label: `${manifest.method} ${manifest.path}`,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0
    };
    current.requests += 1;
    current.inputTokens += manifest.upstreamInputTokens ?? 0;
    current.outputTokens += manifest.upstreamOutputTokens ?? 0;
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => b.inputTokens - a.inputTokens).slice(0, 10);
}
