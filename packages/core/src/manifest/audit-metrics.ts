import type { AuditManifest } from "./audit-store.ts";

export function confirmedSavedTokens(manifest: AuditManifest): number {
  if (manifest.estimatedSavedTokens > 0) return manifest.estimatedSavedTokens;
  if (manifest.compressedItems <= 0) return 0;
  return Math.max(0, manifest.estimatedOriginalTokens - manifest.estimatedCompressedTokens);
}
