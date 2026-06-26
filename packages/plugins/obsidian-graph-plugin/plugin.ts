import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";
import { summarizeAudit } from "../../core/src/manifest/audit-summary.ts";
import { projectMetrics } from "../shared/audit-projects.ts";
export { descriptor } from "./descriptor.ts";

export const plugin: MolenkopfPluginModule = {
  getData(ctx) {
    const summary = summarizeAudit(ctx.manifests);
    const projects = projectMetrics(ctx.manifests);
    const graph = ctx.memoryGraph ?? { nodes: [], edges: [] };
    return {
      plugin: ctx.plugin,
      scopes: ctx.scopes,
      metrics: {
        requests: summary.requests,
        concepts: graph.nodes.length,
        links: graph.edges.length,
        savedTokens: summary.savedTokens,
        inputTokens: summary.upstreamInputTokens,
        outputTokens: summary.upstreamOutputTokens,
        totalTokens: summary.upstreamInputTokens + summary.upstreamOutputTokens,
        projects
      },
      memoryGraph: graph
    };
  }
};
