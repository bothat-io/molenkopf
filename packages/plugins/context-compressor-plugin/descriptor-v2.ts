import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";

const settings = {
  type: "object",
  properties: {
    mode: { type: "enum", values: ["off", "observe", "transform"], orderedValues: ["off", "observe", "transform"], default: "transform", restrictiveMerge: "orderedMax" },
    minSavedTokens: { type: "integer", minimum: 0, maximum: 100000, default: 0, restrictiveMerge: "maxWins" },
    minSavedPercent: { type: "number", minimum: 0, maximum: 100, default: 0, restrictiveMerge: "maxWins" },
    minJsonStringChars: { type: "integer", minimum: 100, maximum: 100000, default: 2000, restrictiveMerge: "maxWins" },
    maxBodyBytes: { type: "integer", minimum: 1024, maximum: 33554432, default: 8388608, restrictiveMerge: "minWins" },
    maxCandidatesPerRequest: { type: "integer", minimum: 1, maximum: 64, default: 16, restrictiveMerge: "minWins" },
    allowedKinds: { type: "array", items: { type: "enum", values: ["json", "log", "stacktrace", "shell_output"] }, default: ["json", "log", "stacktrace", "shell_output"], restrictiveMerge: "intersection" }
  }
} as const;

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "context-compressor-plugin",
  category: "compression",
  risk: "green",
  capabilities: ["body:redacted:read", "body:write", "audit:read:scoped", "audit:write", "settings:read"],
  actions: [],
  settingsSchema: settings,
  defaultPolicy: {
    enabled: false,
    maxRisk: "green",
    capabilities: ["body:redacted:read", "body:write", "audit:read:scoped", "audit:write", "settings:read"],
    settings,
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
