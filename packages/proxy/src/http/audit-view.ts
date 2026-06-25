import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import { auditPath } from "./request-path.ts";

export function auditView(manifest: AuditManifest): AuditManifest {
  return {
    ...manifest,
    path: auditPath(manifest.path),
    retrievalIds: manifest.retrievalIds.slice(0, 10),
    warnings: manifest.warnings.slice(0, 10)
  };
}

export function auditViews(manifests: AuditManifest[]): AuditManifest[] {
  return manifests.map(auditView);
}
