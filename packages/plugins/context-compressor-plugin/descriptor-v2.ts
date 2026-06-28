import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "context-compressor-plugin",
  category: "compression",
  risk: "green",
  capabilities: ["body:redacted:read", "body:write", "audit:read:scoped", "audit:write"],
  actions: [],
  settingsSchema: { type: "object", properties: {} },
  defaultPolicy: {
    enabled: false,
    maxRisk: "green",
    capabilities: ["body:redacted:read", "body:write", "audit:read:scoped", "audit:write"],
    settings: { type: "object", properties: {} },
    actions: []
  },
  workspace: {
    pagePath: "/__molenkopf/plugins/context-compressor-plugin/page",
    dataPath: "/__molenkopf/plugins/context-compressor-plugin/data"
  },
  dataScopes: ["metrics", "audit-summary", "requests"],
  modulePath: "plugin.ts"
};

export const runtimeMetadata: BuiltinPluginRuntimeMetadata = {
  type: "transformer",
  description: "Compresses large safe context and keeps bounded redacted excerpts locally.",
  traffic: { reads: ["redacted-body", "audit"], mutates: ["transform"] },
  permissions: ["body:read", "body:write", "audit:read", "audit:write"],
  hooks: ["request:body:rewrite", "audit:manifest", "workspace:local-page"],
  defaultEnabled: false,
  canDisable: true
};
