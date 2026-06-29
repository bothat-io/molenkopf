import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";

export type RepeatedContextFinding = {
  project: string;
  endpoint: string;
  requests: number;
  repeatedInputTokens: number;
  averageInputTokens: number;
  confidence: "low" | "high";
  reason: "content_fingerprints_unavailable" | "matching_content_fingerprint";
};

const MIN_REQUESTS = 3;
const MIN_TOTAL_INPUT_TOKENS = 1000;
const MIN_AVERAGE_INPUT_TOKENS = 250;

export function detectRepeatedContext(manifests: readonly AuditManifest[]): RepeatedContextFinding[] {
  const fingerprintFindings = byFingerprint(manifests);
  if (fingerprintFindings.length) return fingerprintFindings;
  const grouped = new Map<string, RepeatedContextFinding>();
  for (const manifest of manifests) {
    const project = manifest.client?.project ?? "unattributed";
    const endpoint = `${manifest.method} ${manifest.path}`;
    const key = `${project}|${endpoint}`;
    const item = grouped.get(key) ?? {
      project,
      endpoint,
      requests: 0,
      repeatedInputTokens: 0,
      averageInputTokens: 0,
      confidence: "low",
      reason: "content_fingerprints_unavailable"
    };
    item.requests += 1;
    item.repeatedInputTokens += manifest.upstreamInputTokens ?? 0;
    item.averageInputTokens = Math.round(item.repeatedInputTokens / item.requests);
    grouped.set(key, item);
  }
  return [...grouped.values()]
    .filter((item) =>
      item.requests >= MIN_REQUESTS &&
      item.repeatedInputTokens >= MIN_TOTAL_INPUT_TOKENS &&
      item.averageInputTokens >= MIN_AVERAGE_INPUT_TOKENS
    )
    .sort((a, b) => b.repeatedInputTokens - a.repeatedInputTokens)
    .slice(0, 5);
}

function byFingerprint(manifests: readonly AuditManifest[]): RepeatedContextFinding[] {
  const grouped = new Map<string, RepeatedContextFinding>();
  for (const manifest of manifests) {
    const seen = new Set<string>();
    for (const fingerprint of manifest.contentFingerprints ?? []) {
      if (seen.has(fingerprint.hash)) continue;
      seen.add(fingerprint.hash);
      const project = manifest.client?.project ?? "unattributed";
      const endpoint = `${manifest.method} ${manifest.path}`;
      const key = `${project}|${endpoint}|${fingerprint.contentKind}|${fingerprint.hash}`;
      const item = grouped.get(key) ?? { project, endpoint, requests: 0, repeatedInputTokens: 0, averageInputTokens: 0, confidence: "high", reason: "matching_content_fingerprint" };
      item.requests += 1;
      item.repeatedInputTokens += fingerprint.estimatedOriginalTokens;
      item.averageInputTokens = Math.round(item.repeatedInputTokens / item.requests);
      grouped.set(key, item);
    }
  }
  return [...grouped.values()].filter((item) => item.requests >= 2).sort((a, b) => b.repeatedInputTokens - a.repeatedInputTokens).slice(0, 5);
}
