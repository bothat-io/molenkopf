import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "obsidian-graph-plugin",
  name: "obsidian-graph-plugin",
  category: "visualization",
  risk: "green",
  capabilities: ["audit:read:scoped"],
  actions: [],
  settingsSchema: { type: "object", properties: {} },
  defaultPolicy: {
    enabled: true,
    maxRisk: "green",
    capabilities: ["audit:read:scoped"],
    settings: { type: "object", properties: {} },
    actions: []
  },
  workspace: {
    pagePath: "/__molenkopf/plugins/obsidian-graph-plugin/page",
    dataPath: "/__molenkopf/plugins/obsidian-graph-plugin/data"
  },
  dataScopes: ["metrics", "memory-graph"],
  modulePath: "plugin.ts"
};

export const runtimeMetadata: BuiltinPluginRuntimeMetadata = {
  type: "observer",
  description: "Local workspace for memory graph rendering from compressed text decisions.",
  traffic: { reads: ["audit"], mutates: ["none"] },
  permissions: ["audit:read"],
  hooks: ["workspace:local-page"],
  defaultEnabled: true,
  canDisable: true
};
