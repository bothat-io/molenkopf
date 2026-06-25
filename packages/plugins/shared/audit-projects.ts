import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { confirmedSavedTokens } from "../../core/src/manifest/audit-metrics.ts";

export function projectMetrics(manifests: AuditManifest[]) {
  const map = new Map<string, { id: string; label: string; requests: number; originalTokens: number; compressedTokens: number; inputTokens: number; outputTokens: number; savedTokens: number; clients: Set<string>; latestAt?: string }>();
  for (const manifest of manifests) {
    const id = manifest.client?.project?.trim() || "unassigned";
    const item = map.get(id) ?? { id, label: id === "unassigned" ? "No project" : id, requests: 0, originalTokens: 0, compressedTokens: 0, inputTokens: 0, outputTokens: 0, savedTokens: 0, clients: new Set(), latestAt: undefined };
    item.requests++;
    item.originalTokens += manifest.estimatedOriginalTokens;
    item.compressedTokens += manifest.estimatedCompressedTokens;
    item.inputTokens += manifest.upstreamInputTokens ?? 0;
    item.outputTokens += manifest.upstreamOutputTokens ?? 0;
    item.savedTokens += confirmedSavedTokens(manifest);
    item.clients.add(manifest.client?.id ?? "anonymous");
    if (!item.latestAt || manifest.timestamp > item.latestAt) item.latestAt = manifest.timestamp;
    map.set(id, item);
  }
  return [...map.values()].map((item) => ({
    id: item.id,
    label: item.label,
    requests: item.requests,
    originalTokens: item.originalTokens,
    compressedTokens: item.compressedTokens,
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    savedTokens: item.savedTokens,
    savedPercent: item.originalTokens > 0 && item.savedTokens > 0 ? Math.round((item.savedTokens / item.originalTokens) * 10000) / 100 : 0,
    clients: item.clients.size,
    latestAt: item.latestAt
  })).sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens) || b.requests - a.requests || a.id.localeCompare(b.id));
}
