import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";
import { handleProjectGraphAction, projectGraphDataView } from "./actions.ts";
export { descriptorV2 } from "./descriptor-v2.ts";

export const plugin: MolenkopfPluginModule = {
  getData(ctx) {
    return {
      plugin: ctx.plugin,
      scopes: ctx.scopes,
      settingsView: {},
      ...projectGraphDataView(),
      latestScanStatus: "not_scanned",
      latestWarnings: [],
      pluginDescriptorFacts: [],
      storageUsageFacts: [],
      eventUsageFacts: [],
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
