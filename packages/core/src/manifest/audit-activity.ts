import type { AuditManifest } from "./audit-store.ts";
import { confirmedSavedTokens } from "./audit-metrics.ts";

export type AuditActivityGroup = {
  id: string;
  label: string;
  clientId: string;
  clientLabel: string;
  keyId?: string;
  project?: string;
  providerId: string;
  endpoint: string;
  status: string;
  requests: number;
  errors: number;
  unknown: number;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  compressedItems: number;
  retrievalRefs: number;
  latestAt?: string;
};

export function summarizeRecentActivity(manifests: AuditManifest[], limit = 8): AuditActivityGroup[] {
  const groups = new Map<string, AuditActivityGroup>();
  for (const manifest of manifests.slice(-50)) add(groups, manifest);
  return [...groups.values()]
    .sort((a, b) => (b.latestAt ?? "").localeCompare(a.latestAt ?? "") || b.requests - a.requests || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function add(groups: Map<string, AuditActivityGroup>, manifest: AuditManifest) {
  const client: NonNullable<AuditManifest["client"]> = manifest.client ?? { id: "anonymous", label: "unattributed client", source: "anonymous" };
  const providerId = manifest.providerId || manifest.targetHost || "unknown";
  const endpoint = `${manifest.method} ${pathOnly(manifest.path)}`;
  const status = statusGroup(manifest.statusCode);
  const id = [client.id, client.keyId ?? "", client.project ?? "", providerId, endpoint, status].join("|");
  const group: AuditActivityGroup = groups.get(id) ?? {
    id, label: `${client.label} -> ${providerId}`, clientId: client.id, clientLabel: client.label, keyId: client.keyId, project: client.project,
    providerId, endpoint, status, requests: 0, errors: 0, unknown: 0, originalTokens: 0, compressedTokens: 0,
    savedTokens: 0, compressedItems: 0, retrievalRefs: 0
  };
  group.requests++;
  if (statusKind(manifest.statusCode) === "error") group.errors++;
  if (statusKind(manifest.statusCode) === "unknown") group.unknown++;
  group.originalTokens += manifest.estimatedOriginalTokens;
  group.compressedTokens += manifest.estimatedCompressedTokens;
  group.savedTokens += confirmedSavedTokens(manifest);
  group.compressedItems += manifest.compressedItems;
  group.retrievalRefs += manifest.retrievalIds.length;
  if (!group.latestAt || manifest.timestamp > group.latestAt) group.latestAt = manifest.timestamp;
  groups.set(id, group);
}

function statusGroup(statusCode: number | undefined): string {
  if (statusCode === undefined) return "unknown";
  return `${Math.floor(statusCode / 100)}xx`;
}

function statusKind(statusCode: number | undefined): "ok" | "error" | "unknown" {
  if (!Number.isInteger(statusCode)) return "unknown";
  if (statusCode >= 200 && statusCode <= 399) return "ok";
  if (statusCode >= 400 && statusCode <= 599) return "error";
  return "unknown";
}

function pathOnly(path: string): string {
  try {
    return new URL(path, "http://molenkopf.local").pathname || "/";
  } catch {
    return "unknown";
  }
}
