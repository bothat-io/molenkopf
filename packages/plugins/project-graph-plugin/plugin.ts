import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";
import { handleProjectGraphAction, projectGraphDataView } from "./actions.ts";
export { descriptorV2 } from "./descriptor-v2.ts";

export const plugin: MolenkopfPluginModule = {
  async getData(ctx, runtime) {
    const graphData = await projectGraphDataView(runtime);
    return {
      plugin: ctx.plugin,
      scopes: ctx.scopes,
      settingsView: {},
      latestScanStatus: "not_scanned",
      latestWarnings: [],
      graphSummaries: [],
      routes: [],
      topFilesByDegree: [],
      topSymbolsByDegree: [],
      pluginDescriptorFacts: [],
      storageUsageFacts: [],
      eventUsageFacts: [],
      suggestedRootPath: ctx.canManage ? process.cwd() : undefined,
      ...graphData,
      queryExamples: ["symbol:PluginDescriptor", "route:/__molenkopf", "tests:plugin"],
      safety: {
        storesFullSource: false,
        scansExplicitRootsOnly: true,
        mcpExposure: "disabled"
      }
    };
  },
  executeAction: handleProjectGraphAction
};
