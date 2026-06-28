import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";
import { handleProjectGraphAction, projectGraphDataView } from "./actions.ts";
export { descriptorV2 } from "./descriptor-v2.ts";

export const plugin: MolenkopfPluginModule = {
  async getData(ctx, runtime) {
    const graphData = await projectGraphDataView(runtime, ctx.manifests, graphScope(ctx));
    return {
      plugin: ctx.plugin,
      scopes: ctx.scopes,
      settingsView: {},
      latestDerivationStatus: "not_derived",
      latestWarnings: [],
      graphSummaries: [],
      routes: [],
      topFilesByDegree: [],
      topSymbolsByDegree: [],
      pluginDescriptorFacts: [],
      storageUsageFacts: [],
      eventUsageFacts: [],
      ...graphData,
      queryExamples: ["route:/v1", "provider:", "client:"],
      safety: {
        storesFullSource: false,
        scansFilesystem: false,
        derivesFromTokenMetadata: true,
        mcpExposure: "disabled"
      }
    };
  },
  executeAction: handleProjectGraphAction
};

function graphScope(ctx: { userId?: string; teamIds?: string[] }): string {
  if (!ctx.userId) return "admin";
  return `user:${ctx.userId ?? "anonymous"}|teams:${[...(ctx.teamIds ?? [])].sort().join(",")}`;
}
