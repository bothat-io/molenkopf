import type { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import { UsageSnapshotError, type UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import { auditCursor, recordUsage } from "./usage-accounting.ts";
import type { RuntimeState, UsageTotals } from "./runtime-types.ts";

const USAGE_FIELDS = ["usageByAgent", "usageByUser", "usageByProvider", "usageByKey", "usageByTeam"] as const;
type UsageField = typeof USAGE_FIELDS[number];

export async function restoreUsage(state: RuntimeState, snapshots: UsageSnapshotStore, audit: AuditStore): Promise<void> {
  const manifests = await audit.list();
  const latestCursor = manifests.length ? auditCursor(manifests[manifests.length - 1]) : undefined;
  const snapshot = await snapshots.load().catch((error) => {
    if (error instanceof UsageSnapshotError) return undefined;
    throw error;
  });
  const restored = snapshot ? validateSnapshot(snapshot) : undefined;
  if (restored && (!latestCursor || snapshot.usageSnapshotCursor === latestCursor)) {
    for (const field of USAGE_FIELDS) state[field] = restored[field];
    state.usageSnapshotCursor = snapshot.usageSnapshotCursor;
    return;
  }
  resetUsage(state);
  for (const manifest of manifests) recordUsage(state, manifest);
  state.usageSnapshotCursor = latestCursor;
  await snapshots.save(state).catch(() => {});
}

function validateSnapshot(snapshot: Partial<Record<UsageField, unknown>>): Pick<RuntimeState, UsageField> | undefined {
  const out = {} as Pick<RuntimeState, UsageField>;
  for (const field of USAGE_FIELDS) {
    const value = snapshot[field];
    if (value === undefined) out[field] = {};
    else {
      const clean = validateUsageMap(value);
      if (!clean) return undefined;
      out[field] = clean;
    }
  }
  return out;
}

function validateUsageMap(value: unknown): Record<string, UsageTotals> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, UsageTotals> = {};
  for (const [id, totals] of Object.entries(value)) {
    if (typeof id !== "string") return undefined;
    const clean = validateTotals(totals);
    if (!clean) return undefined;
    out[id] = clean;
  }
  return out;
}

function validateTotals(value: unknown): UsageTotals | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as UsageTotals & { reasoning?: Record<string, UsageTotals> };
  if (!count(item.requests) || !count(item.inputTokens) || !count(item.outputTokens) || !money(item.costEur)) return undefined;
  const out: UsageTotals & { reasoning?: Record<string, UsageTotals> } = { requests: item.requests, inputTokens: item.inputTokens, outputTokens: item.outputTokens, costEur: item.costEur ?? 0 };
  if (item.models !== undefined) {
    const models = validateUsageMap(item.models);
    if (!models) return undefined;
    out.models = models;
  }
  if (item.reasoning !== undefined) {
    const reasoning = validateUsageMap(item.reasoning);
    if (!reasoning) return undefined;
    out.reasoning = reasoning;
  }
  if (item.periods !== undefined) {
    const periods = validateUsageMap(item.periods);
    if (!periods) return undefined;
    out.periods = periods;
  }
  return out;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function money(value: unknown): boolean {
  return value === undefined || count(value);
}

function resetUsage(state: RuntimeState): void {
  for (const field of USAGE_FIELDS) state[field] = {};
}
