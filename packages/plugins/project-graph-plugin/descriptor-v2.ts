import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";
import { projectGraphSettingsSchema } from "./settings.ts";

const capabilities = [
  "project:roots:read", "project:files:discover", "project:files:read",
  "project:graph:read", "project:graph:write", "settings:read", "action:execute"
] as const;

export const descriptorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "project-graph-plugin",
  name: "Project Graph",
  category: "storage",
  risk: "orange",
  capabilities,
  settingsSchema: projectGraphSettingsSchema,
  actions: [
    {
      id: "scan.preview",
      label: "Preview scan",
      description: "Discover safe source files under a configured project root without reading file contents.",
      requiredCapabilities: ["project:files:discover", "action:execute"],
      requiredRole: "admin",
      risk: "yellow",
      inputSchema: { type: "object", properties: { rootPath: { type: "string", maxLength: 500 }, maxFiles: { type: "integer", minimum: 1, maximum: 5000, default: 5000 } }, required: ["rootPath"] },
      outputSchema: { type: "object", properties: {}, additionalProperties: true },
      confirmation: "none",
      sideEffects: ["none"],
      auditEvent: true,
      outputSafety: "adminSafe"
    },
    {
      id: "scan.run",
      label: "Run scan",
      description: "Read safe source files under a configured project root and build an in-memory project graph.",
      requiredCapabilities: ["project:files:discover", "project:files:read", "project:graph:write", "action:execute"],
      requiredRole: "admin",
      risk: "orange",
      inputSchema: { type: "object", properties: { rootPath: { type: "string", maxLength: 500 }, mode: { type: "enum", values: ["manual"], default: "manual" } }, required: ["rootPath"] },
      outputSchema: { type: "object", properties: {}, additionalProperties: true },
      confirmation: "required",
      sideEffects: ["storage"],
      auditEvent: true,
      outputSafety: "adminSafe"
    },
    {
      id: "graph.query",
      label: "Query graph",
      description: "Search symbols in the latest in-memory project graph.",
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
      label: "Node neighborhood",
      description: "Return adjacent graph nodes and edges for the latest in-memory project graph.",
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
      label: "Delete graph",
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
  defaultPolicy: { enabled: true, maxRisk: "orange", capabilities, settings: projectGraphSettingsSchema, actions: ["scan.preview", "scan.run", "graph.query", "graph.neighborhood", "graph.delete"] },
  workspace: {
    pagePath: "/__molenkopf/plugins/project-graph-plugin/page",
    dataPath: "/__molenkopf/plugins/project-graph-plugin/data"
  },
  dataScopes: ["metrics", "project-graph", "routes", "symbols"],
  modulePath: "plugin.ts"
};

export const runtimeMetadata: BuiltinPluginRuntimeMetadata = {
  type: "observer",
  description: "Builds local source-code structure graphs from explicitly configured project roots.",
  traffic: { reads: ["metadata", "project-files", "project-graph"], mutates: ["none"] },
  permissions: ["project:files:discover", "project:files:read", "project:graph:read", "project:graph:write"],
  hooks: ["workspace:local-page"],
  defaultEnabled: true,
  canDisable: true
};
