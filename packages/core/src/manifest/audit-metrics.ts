import type { AuditManifest } from "./audit-store.ts";

export function confirmedSavedTokens(manifest: AuditManifest): number {
  if (manifest.compressedItems <= 0) return 0;
  if (manifest.estimatedSavedTokens > 0) return manifest.estimatedSavedTokens;
  return Math.max(0, manifest.estimatedOriginalTokens - manifest.estimatedCompressedTokens);
}
