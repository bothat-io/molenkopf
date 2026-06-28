import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";
import { projectGraphSettingsSchema } from "./settings.ts";

const capabilities = [
  "metadata:read", "audit:read:scoped", "project:graph:read",
  "project:graph:write", "settings:read", "action:execute"
] as const;

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "project-graph-plugin",
  name: "project-graph-plugin",
  category: "storage",
  risk: "orange",
  capabilities,
  settingsSchema: projectGraphSettingsSchema,
  actions: [
    {
      id: "graph.query",
      label: "graph.query",
      description: "Search the project graph derived from token and audit metadata.",
      requiredCapabilities: ["project:graph:read", "action:execute"],
      requiredRole: "member",
      risk: "green",
      inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 120 }, limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } }, required: ["query"] },
      outputSchema: { type: "object", properties: {}, additionalProperties: true },
      confirmation: "none",
      sideEffects: ["none"],
      auditEvent: false,
      outputSafety: "strict"
    },
    {
      id: "graph.neighborhood",
      label: "graph.neighborhood",
      description: "Return adjacent graph nodes and edges from the derived project graph.",
      requiredCapabilities: ["project:graph:read", "action:execute"],
      requiredRole: "member",
      risk: "green",
      inputSchema: { type: "object", properties: { nodeId: { type: "string", maxLength: 500 }, depth: { type: "integer", minimum: 1, maximum: 3, default: 1 } }, required: ["nodeId"] },
      outputSchema: { type: "object", properties: {}, additionalProperties: true },
      confirmation: "none",
      sideEffects: ["none"],
      auditEvent: false,
      outputSafety: "strict"
    },
    {
      id: "graph.delete",
      label: "graph.delete",
      description: "Delete the stored project graph for a root id.",
      requiredCapabilities: ["project:graph:write", "action:execute"],
      requiredRole: "admin",
      risk: "orange",
      inputSchema: { type: "object", properties: { rootId: { type: "string", maxLength: 80 }, confirm: { type: "string", maxLength: 80 } }, required: ["rootId", "confirm"] },
      outputSchema: { type: "object", properties: {}, additionalProperties: true },
      confirmation: "typed",
      sideEffects: ["storage"],
      auditEvent: true,
      outputSafety: "adminSafe"
    }
  ],
  defaultPolicy: { enabled: true, maxRisk: "orange", capabilities, settings: projectGraphSettingsSchema, actions: ["graph.query", "graph.neighborhood", "graph.delete"] },
  workspace: {
    pagePath: "/__molenkopf/plugins/project-graph-plugin/page",
    dataPath: "/__molenkopf/plugins/project-graph-plugin/data"
  },
  dataScopes: ["metrics", "project-graph", "routes", "symbols"],
  modulePath: "plugin.ts"
};

export const runtimeMetadata: BuiltinPluginRuntimeMetadata = {
  type: "observer",
  description: "Derives project graph metadata from token usage and scoped audit metadata without scanning source files.",
  traffic: { reads: ["metadata", "audit", "project-graph"], mutates: ["none"] },
  permissions: ["metadata:read", "audit:read", "project:graph:read", "project:graph:write"],
  hooks: ["workspace:local-page"],
  defaultEnabled: true,
  canDisable: true
};
