import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";
import { tokenOptimizerSettingsSchema } from "./settings.ts";

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "token-optimizer-plugin",
  name: "token-optimizer-plugin",
  category: "routing",
  risk: "green",
  capabilities: ["metadata:read", "audit:read:scoped", "settings:read", "policy:recommend"],
  actions: [],
  settingsSchema: tokenOptimizerSettingsSchema,
  defaultPolicy: {
    enabled: true,
    maxRisk: "green",
    capabilities: ["metadata:read", "audit:read:scoped", "settings:read", "policy:recommend"],
    settings: tokenOptimizerSettingsSchema,
    actions: []
  },
  workspace: {
    pagePath: "/__molenkopf/plugins/token-optimizer-plugin/page",
    dataPath: "/__molenkopf/plugins/token-optimizer-plugin/data"
  },
  dataScopes: ["metrics", "audit-summary", "requests"],
  modulePath: "plugin.ts"
};

export const runtimeMetadata: BuiltinPluginRuntimeMetadata = {
  type: "observer",
  description: "Observes token usage, budgets, and repeated token pressure without mutating traffic.",
  traffic: { reads: ["audit", "metadata"], mutates: ["none"] },
  permissions: ["audit:read", "metadata:read"],
  hooks: ["workspace:local-page"],
  defaultEnabled: true,
  canDisable: true
};
