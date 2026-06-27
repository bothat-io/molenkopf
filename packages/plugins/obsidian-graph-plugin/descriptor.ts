import type { PluginDescriptor } from "../../core/src/plugins/plugin-descriptor.ts";

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
