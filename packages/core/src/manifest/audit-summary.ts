import type { AuditManifest } from "./audit-store.ts";
import { confirmedSavedTokens } from "./audit-metrics.ts";

export type AuditSummaryTotals = {
  requests: number;
  ok: number;
  errors: number;
  unknown: number;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savedPercent: number;
  upstreamInputTokens: number;
  upstreamOutputTokens: number;
  compressedItems: number;
  redactedSecrets: number;
  warnings: number;
};

export type AuditSummaryCount = { id: string; label: string; count: number };

export type AuditSummaryStatusTotals = {
  ok: number;
  errors: number;
  unknown: number;
  byClass: AuditSummaryCount[];
  byCode: AuditSummaryCount[];
};

export type AuditSummaryWarningTotals = { requests: number; warnings: number };

export type AuditSummaryBucket = AuditSummaryTotals & {
  id: string;
  label: string;
  source: string;
  project?: string;
  latestAt?: string;
};

export type AuditSummaryBreakdown = AuditSummaryTotals & { id: string; label: string; latestAt?: string };

export type AuditSummary = AuditSummaryTotals & {
  buckets: AuditSummaryBucket[];
  statusTotals: AuditSummaryStatusTotals;
  warningTotals: AuditSummaryWarningTotals;
  providers: AuditSummaryBreakdown[];
  endpoints: AuditSummaryBreakdown[];
};

type MutableTotals = Omit<AuditSummaryTotals, "savedPercent">;
type MutableBucket = Omit<AuditSummaryBucket, "savedPercent">;
type MutableBreakdown = Omit<AuditSummaryBreakdown, "savedPercent">;

type StatusAccumulator = { unknown: number; byClass: Map<string, AuditSummaryCount>; byCode: Map<string, AuditSummaryCount> };

export function summarizeAudit(manifests: AuditManifest[]): AuditSummary {
  const totals = empty();
  const buckets = new Map<string, MutableBucket>();
  const providers = new Map<string, MutableBreakdown>();
  const endpoints = new Map<string, MutableBreakdown>();
  const status = emptyStatus();
  let warningRequests = 0;
  for (const manifest of manifests) {
    add(totals, manifest);
    addStatus(status, manifest.statusCode);
    if (manifest.warnings.length > 0) warningRequests++;
    const client = manifest.client ?? { id: "anonymous", label: "unattributed client", source: "anonymous" as const };
    addGroup(bucketFor(buckets, client), manifest);
    addGroup(breakdownFor(providers, providerId(manifest), providerLabel(manifest)), manifest);
    addGroup(breakdownFor(endpoints, endpointId(manifest), endpointLabel(manifest)), manifest);
  }
  return {
    ...finish(totals),
    buckets: sortGroups([...buckets.values()].map(finish)),
    statusTotals: {
      ok: totals.ok,
      errors: totals.errors,
      unknown: status.unknown,
      byClass: sortCounts(status.byClass),
      byCode: sortCounts(status.byCode)
    },
    warningTotals: { requests: warningRequests, warnings: totals.warnings },
    providers: sortGroups([...providers.values()].map(finish)),
    endpoints: sortGroups([...endpoints.values()].map(finish))
  };
}

function empty(): MutableTotals {
  return { requests: 0, ok: 0, errors: 0, unknown: 0, originalTokens: 0, compressedTokens: 0, savedTokens: 0, upstreamInputTokens: 0, upstreamOutputTokens: 0, compressedItems: 0, redactedSecrets: 0, warnings: 0 };
}

function emptyStatus(): StatusAccumulator { return { unknown: 0, byClass: new Map(), byCode: new Map() }; }

function add(target: MutableTotals, manifest: AuditManifest) {
  target.requests++;
  const status = statusKind(manifest.statusCode);
  if (status === "ok") target.ok++;
  else if (status === "error") target.errors++;
  else target.unknown++;
  target.originalTokens += manifest.estimatedOriginalTokens;
  target.compressedTokens += manifest.estimatedCompressedTokens;
  target.savedTokens += confirmedSavedTokens(manifest);
  target.upstreamInputTokens += manifest.upstreamInputTokens ?? 0;
  target.upstreamOutputTokens += manifest.upstreamOutputTokens ?? 0;
  target.compressedItems += manifest.compressedItems;
  target.redactedSecrets += manifest.redactedSecrets;
  target.warnings += manifest.warnings.length;
}

function addGroup<T extends MutableTotals & { latestAt?: string }>(target: T, manifest: AuditManifest): T {
  add(target, manifest);
  if (!target.latestAt || manifest.timestamp > target.latestAt) target.latestAt = manifest.timestamp;
  return target;
}

function addStatus(status: StatusAccumulator, statusCode: number | undefined) {
  const kind = statusKind(statusCode);
  if (statusCode === undefined) {
    status.unknown++;
    bump(status.byCode, "unknown", "unknown");
    bump(status.byClass, "unknown", "unknown");
    return;
  }
  const code = String(statusCode);
  const statusClass = kind === "unknown" && (statusCode < 100 || statusCode > 599) ? "unknown" : `${Math.floor(statusCode / 100)}xx`;
  if (kind === "unknown") status.unknown++;
  bump(status.byCode, code, code);
  bump(status.byClass, statusClass, statusClass);
}

function bucketFor(map: Map<string, MutableBucket>, client: NonNullable<AuditManifest["client"]>): MutableBucket {
  const id = client.keyId ? `key:${client.keyId}:project:${client.project ?? "none"}` : client.id;
  const bucket = map.get(id) ?? { id, label: client.label, source: client.source, project: client.project, ...empty() };
  bucket.project ??= client.project;
  map.set(id, bucket);
  return bucket;
}

function statusKind(statusCode: number | undefined): "ok" | "error" | "unknown" {
  return !Number.isInteger(statusCode) ? "unknown" : statusCode >= 200 && statusCode <= 399 ? "ok" : statusCode >= 400 && statusCode <= 599 ? "error" : "unknown";
}

function breakdownFor(map: Map<string, MutableBreakdown>, id: string, label: string): MutableBreakdown {
  const item = map.get(id) ?? { id, label, ...empty() };
  map.set(id, item);
  return item;
}

function finish<T extends MutableTotals>(totals: T): T & { savedPercent: number } {
  return { ...totals, savedPercent: percent(totals.savedTokens, totals.originalTokens) };
}

function percent(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function sortGroups<T extends AuditSummaryTotals & { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => b.savedTokens - a.savedTokens || b.requests - a.requests || a.id.localeCompare(b.id));
}

function sortCounts(map: Map<string, AuditSummaryCount>): AuditSummaryCount[] {
  return [...map.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function bump(map: Map<string, AuditSummaryCount>, id: string, label: string) {
  const item = map.get(id) ?? { id, label, count: 0 };
  item.count++;
  map.set(id, item);
}

function providerId(manifest: AuditManifest): string {
  return manifest.providerId ? `provider:${manifest.providerId}` : `provider-host:${providerLabel(manifest)}`;
}

function providerLabel(manifest: AuditManifest): string { return manifest.providerId || manifest.targetHost || "unknown"; }

function endpointId(manifest: AuditManifest): string { return `endpoint:${manifest.method}:${endpointPath(manifest.path)}`; }

function endpointLabel(manifest: AuditManifest): string { return `${manifest.method} ${endpointPath(manifest.path)}`; }

function endpointPath(path: string): string {
  try { return new URL(path, "http://molenkopf.local").pathname || "/"; } catch { return "unknown"; }
}
