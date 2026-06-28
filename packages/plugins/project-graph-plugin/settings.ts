import type { PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";

export const projectGraphSettingsSchema: PluginDescriptorV2["settingsSchema"] = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    persistDerivedGraph: { type: "boolean", default: true, restrictiveMerge: "falseWins" }
  }
};
