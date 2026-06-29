import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";

export function snapshotInfo(manifests: readonly AuditManifest[], limit = 200) {
  return {
    scope: "recent_audit_snapshot",
    limit,
    observedRequests: manifests.length,
    from: manifests[0]?.timestamp,
    to: manifests.at(-1)?.timestamp
  };
}
