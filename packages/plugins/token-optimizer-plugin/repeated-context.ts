import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";

export type RepeatedContextFinding = {
  project: string;
  endpoint: string;
  requests: number;
  repeatedInputTokens: number;
};

export function detectRepeatedContext(manifests: readonly AuditManifest[]): RepeatedContextFinding[] {
  const grouped = new Map<string, RepeatedContextFinding>();
  for (const manifest of manifests) {
    const project = manifest.client?.project ?? "unattributed";
    const endpoint = `${manifest.method} ${manifest.path}`;
    const key = `${project}|${endpoint}`;
    const item = grouped.get(key) ?? { project, endpoint, requests: 0, repeatedInputTokens: 0 };
    item.requests += 1;
    item.repeatedInputTokens += manifest.upstreamInputTokens ?? 0;
    grouped.set(key, item);
  }
  return [...grouped.values()]
    .filter((item) => item.requests >= 2 && item.repeatedInputTokens >= 100)
    .sort((a, b) => b.repeatedInputTokens - a.repeatedInputTokens)
    .slice(0, 5);
}
