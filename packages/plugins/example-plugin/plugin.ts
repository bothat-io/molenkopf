import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";

export const plugin: MolenkopfPluginModule = {
  getData(ctx) {
    return {
      plugin: ctx.plugin,
      requestCount: ctx.manifests.length,
      teamIds: ctx.teamIds
    };
  },
  executeAction(action) {
    return { echoed: String(action.input.message || "").slice(0, 32) };
  }
};
