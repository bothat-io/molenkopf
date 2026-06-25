import type { MolenkopfPluginModule, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import type { PluginDescriptor } from "../../core/src/plugins/plugin-descriptor.ts";
import { compressJsonBody } from "../../core/src/pipeline/openai-request-rewriter.ts";
import { summarizeRecentActivity } from "../../core/src/manifest/audit-activity.ts";
import { summarizeAudit } from "../../core/src/manifest/audit-summary.ts";
import type { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { projectMetrics } from "../shared/audit-projects.ts";

export const descriptor: PluginDescriptor = {
  id: "context-compressor-plugin",
  name: "context-compressor-plugin",
  type: "transformer",
  category: "compression",
  description: "Compresses large safe context and keeps retrievable originals locally.",
  traffic: { reads: ["redacted-body", "audit"], mutates: ["transform"] },
  permissions: ["body:read", "body:write", "audit:read", "audit:write"],
  hooks: ["request:body:rewrite", "audit:manifest", "workspace:local-page"],
  toggle: { defaultEnabled: false, canDisable: true },
  modulePath: "plugin.ts",
  workspace: {
    pagePath: "/__molenkopf/plugins/context-compressor-plugin/page",
    dataPath: "/__molenkopf/plugins/context-compressor-plugin/data",
    dataScopes: ["metrics", "audit-summary", "requests"]
  }
};

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
      latest: ctx.manifests.at(-1),
      requests: ctx.manifests.slice(-25),
      requestGroups: summarizeRecentActivity(ctx.manifests)
    };
  }
};

function retrievalStore(runtime: PluginRuntimeContext): RetrievalStore | undefined {
  const candidate = runtime.storage as Partial<RetrievalStore> | undefined;
  return candidate && typeof candidate.save === "function" ? candidate as RetrievalStore : undefined;
}
