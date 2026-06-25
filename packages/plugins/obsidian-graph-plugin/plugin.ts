import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";
import type { PluginDescriptor } from "../../core/src/plugins/plugin-descriptor.ts";
import { summarizeAudit } from "../../core/src/manifest/audit-summary.ts";
import { projectMetrics } from "../shared/audit-projects.ts";

export const descriptor: PluginDescriptor = {
  id: "obsidian-graph-plugin",
  name: "obsidian-graph-plugin",
  type: "observer",
  category: "visualization",
  description: "Local workspace for memory graph rendering from compressed text decisions.",
  traffic: { reads: ["audit"], mutates: ["none"] },
  permissions: ["audit:read"],
  hooks: ["workspace:local-page"],
  toggle: { defaultEnabled: true, canDisable: true },
  modulePath: "plugin.ts",
  workspace: {
    pagePath: "/__molenkopf/plugins/obsidian-graph-plugin/page",
    dataPath: "/__molenkopf/plugins/obsidian-graph-plugin/data",
    dataScopes: ["metrics", "memory-graph"]
  }
};

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
