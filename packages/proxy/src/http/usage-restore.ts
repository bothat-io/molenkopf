import type { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import type { UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import { recordUsage } from "./usage-accounting.ts";
import type { RuntimeState } from "./runtime-types.ts";

const USAGE_FIELDS = ["usageByAgent", "usageByUser", "usageByProvider", "usageByKey", "usageByTeam"] as const;

export async function restoreUsage(state: RuntimeState, snapshots: UsageSnapshotStore, audit: AuditStore): Promise<void> {
  const snapshot = await snapshots.load();
  if (snapshot) {
    for (const field of USAGE_FIELDS) if (snapshot[field]) state[field] = snapshot[field] as RuntimeState[typeof field];
    return;
  }
  for (const manifest of await audit.list()) recordUsage(state, manifest);
  await snapshots.save(state).catch(() => {});
}
