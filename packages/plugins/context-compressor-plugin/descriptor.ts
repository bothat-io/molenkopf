import type { PluginDescriptor } from "../../core/src/plugins/plugin-descriptor.ts";

export const descriptor: PluginDescriptor = {
  id: "context-compressor-plugin",
  name: "context-compressor-plugin",
  type: "transformer",
  category: "compression",
  description: "Compresses large safe context and keeps retrievable originals locally.",
  traffic: { reads: ["redacted-body", "audit"], mutates: ["transform"] },
  permissions: ["body:read", "body:write", "audit:read", "audit:write"],
  hooks: ["request:body:rewrite", "audit:manifest", "workspace:local-page"],
  toggle: { defaultEnabled: false, canDisable: true },
  modulePath: "plugin.ts",
  workspace: {
    pagePath: "/__molenkopf/plugins/context-compressor-plugin/page",
    dataPath: "/__molenkopf/plugins/context-compressor-plugin/data",
    dataScopes: ["metrics", "audit-summary", "requests"]
  }
};
