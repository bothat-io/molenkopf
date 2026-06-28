import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "example-plugin",
  name: "example-plugin",
  category: "visualization",
  risk: "green",
  capabilities: ["metadata:read", "audit:read:scoped", "action:execute"],
  actions: [{
    id: "echo",
    label: "Echo",
    description: "Returns a bounded echo payload.",
    requiredCapabilities: ["action:execute"],
    requiredRole: "member",
    risk: "green",
    inputSchema: { type: "object", properties: { message: { type: "string", maxLength: 32 } }, additionalProperties: false },
    outputSchema: { type: "object", properties: { echoed: { type: "string", maxLength: 32 } }, additionalProperties: false },
    confirmation: "none",
    sideEffects: ["none"],
    auditEvent: false,
    outputSafety: "strict"
  }],
  settingsSchema: { type: "object", properties: {} },
  defaultPolicy: {
    enabled: true,
    maxRisk: "green",
    capabilities: ["metadata:read", "audit:read:scoped", "action:execute"],
    settings: { type: "object", properties: {} },
    actions: ["echo"]
  },
  workspace: {
    pagePath: "/__molenkopf/plugins/example-plugin/page",
    dataPath: "/__molenkopf/plugins/example-plugin/data"
  },
  dataScopes: ["metrics"],
  modulePath: "plugin.ts"
};
