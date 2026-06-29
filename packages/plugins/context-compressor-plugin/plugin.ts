import type { MolenkopfPluginModule, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import { compressJsonBody, type CompressJsonOptions } from "../../core/src/pipeline/openai-request-rewriter.ts";
import { summarizeRecentActivity } from "../../core/src/manifest/audit-activity.ts";
import { summarizeAudit } from "../../core/src/manifest/audit-summary.ts";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import type { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { projectMetrics } from "../shared/audit-projects.ts";
import { snapshotInfo } from "../shared/snapshot.ts";
export { descriptor } from "./descriptor.ts";

export const plugin: MolenkopfPluginModule = {
	  async onRequest(ctx, runtime) {
	    const settings = compressorSettings(ctx.settings);
	    if (!settings.compress && !settings.observe) return {
	      compressionSkipped: 1,
	      skipReasons: { compressor_disabled: 1 },
	      notes: ["context_compressor_disabled"]
	    };
	    const store = retrievalStore(runtime);
	    if (!store) return { compressionSkipped: 1, skipReasons: { retrieval_store_unavailable: 1 }, notes: ["context_compressor_storage_unavailable"] };
	    const result = await compressJsonBody(ctx.body, store, ctx.requestId, { ...settings, fingerprintSecret: runtime.fingerprintSecret });
    return {
      body: result.body,
      compressedItems: result.compressedItems,
	      retrievalIds: result.retrievalIds,
	      compressorsUsed: result.compressorsUsed,
	      savedTokens: result.savedTokens,
	      redactedSecrets: result.redactedSecrets,
	      compressionCandidates: result.compressionCandidates,
	      compressionSkipped: result.compressionSkipped,
	      skipReasons: result.skipReasons,
	      contentKindCounts: result.contentKindCounts,
	      originalBytes: result.originalBytes,
	      forwardedBytes: result.forwardedBytes,
	      compressionRatio: result.compressionRatio,
	      potentialCompressedItems: result.potentialCompressedItems,
	      potentialSavedTokens: result.potentialSavedTokens,
	      potentialSavedBytes: result.potentialSavedBytes,
	      contentFingerprints: result.contentFingerprints
	    };
  },
	  getData(ctx, runtime) {
	    const summary = summarizeAudit(ctx.manifests);
	    const projects = projectMetrics(ctx.manifests);
	    return {
	      plugin: ctx.plugin,
	      scopes: ctx.scopes,
	      snapshot: snapshotInfo(ctx.manifests),
	      metrics: { ...summary, projects },
	      diagnostics: compressionDiagnostics(ctx.manifests, Boolean(retrievalStore(runtime))),
	      latest: cloneManifest(ctx.manifests.at(-1)),
	      requests: ctx.manifests.slice(-25).map(cloneManifest),
	      requestGroups: summarizeRecentActivity(ctx.manifests)
    };
  }
};

function cloneManifest(manifest: AuditManifest | undefined): AuditManifest | undefined {
  return manifest ? structuredClone(manifest) : undefined;
}

function compressorSettings(value: Record<string, unknown>): CompressJsonOptions {
  const mode = value.mode === "off" || value.mode === "observe" || value.mode === "transform" ? value.mode : "transform";
  return {
    compress: mode === "transform",
    observe: mode === "observe",
    minSavedTokens: numberValue(value.minSavedTokens),
    minSavedPercent: numberValue(value.minSavedPercent),
    minJsonStringChars: numberValue(value.minJsonStringChars),
    maxBodyBytes: numberValue(value.maxBodyBytes),
    maxCandidatesPerRequest: numberValue(value.maxCandidatesPerRequest),
    allowedKinds: Array.isArray(value.allowedKinds) ? value.allowedKinds.filter((item): item is string => typeof item === "string") : undefined
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function compressionDiagnostics(manifests: AuditManifest[], storageAvailable: boolean) {
  const skipReasons: Record<string, number> = {};
  const contentKindCounts: Record<string, number> = {};
  let compressionCandidates = 0, compressionSkipped = 0, originalBytes = 0, forwardedBytes = 0, potentialSavedTokens = 0;
  for (const manifest of manifests) {
    compressionCandidates += manifest.compressionCandidates ?? 0;
    compressionSkipped += manifest.compressionSkipped ?? 0;
    originalBytes += manifest.originalBytes ?? 0;
    forwardedBytes += manifest.forwardedBytes ?? 0;
    potentialSavedTokens += manifest.potentialSavedTokens ?? 0;
    mergeCounts(skipReasons, manifest.skipReasons);
    mergeCounts(contentKindCounts, manifest.contentKindCounts);
  }
  return { storageAvailable, compressionCandidates, compressionSkipped, originalBytes, forwardedBytes, potentialSavedTokens, skipReasons: rows(skipReasons), contentKindCounts: rows(contentKindCounts) };
}

function mergeCounts(target: Record<string, number>, source: Record<string, number> | undefined): void {
  for (const [key, value] of Object.entries(source ?? {})) target[key] = (target[key] ?? 0) + value;
}

function rows(source: Record<string, number>) {
  return Object.entries(source).map(([id, count]) => ({ id, label: id.replace(/_/g, " "), count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function retrievalStore(runtime: PluginRuntimeContext): RetrievalStore | undefined {
  const candidate = runtime.storage as Partial<RetrievalStore> | undefined;
  return candidate && typeof candidate.save === "function" ? candidate as RetrievalStore : undefined;
}
