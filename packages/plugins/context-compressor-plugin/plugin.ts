import type { MolenkopfPluginModule, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import { compressJsonBody } from "../../core/src/pipeline/openai-request-rewriter.ts";
import { summarizeRecentActivity } from "../../core/src/manifest/audit-activity.ts";
import { summarizeAudit } from "../../core/src/manifest/audit-summary.ts";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import type { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { projectMetrics } from "../shared/audit-projects.ts";
export { descriptor } from "./descriptor.ts";

export const plugin: MolenkopfPluginModule = {
  async onRequest(ctx, runtime) {
    const store = retrievalStore(runtime);
    if (!store) return { notes: ["context_compressor_storage_unavailable"] };
    const result = await compressJsonBody(ctx.body, store, ctx.requestId, true);
    return {
      body: result.body,
      compressedItems: result.compressedItems,
      retrievalIds: result.retrievalIds,
      compressorsUsed: result.compressorsUsed,
      savedTokens: result.savedTokens,
      redactedSecrets: result.redactedSecrets
    };
  },
  getData(ctx) {
    const summary = summarizeAudit(ctx.manifests);
    const projects = projectMetrics(ctx.manifests);
    return {
      plugin: ctx.plugin,
      scopes: ctx.scopes,
      metrics: { ...summary, projects },
      latest: cloneManifest(ctx.manifests.at(-1)),
      requests: ctx.manifests.slice(-25).map(cloneManifest),
      requestGroups: summarizeRecentActivity(ctx.manifests)
    };
  }
};

function cloneManifest(manifest: AuditManifest | undefined): AuditManifest | undefined {
  return manifest ? structuredClone(manifest) : undefined;
}

function retrievalStore(runtime: PluginRuntimeContext): RetrievalStore | undefined {
  const candidate = runtime.storage as Partial<RetrievalStore> | undefined;
  return candidate && typeof candidate.save === "function" ? candidate as RetrievalStore : undefined;
}
