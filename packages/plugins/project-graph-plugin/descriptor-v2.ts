import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";
import type { PluginMiniSchema } from "../../core/src/plugins/plugin-settings-schema.ts";
import type { BuiltinPluginRuntimeMetadata } from "../../core/src/plugins/plugin-runtime-metadata.ts";
import { projectGraphSettingsSchema } from "./settings.ts";

const capabilities = [
  "metadata:read", "audit:read:scoped", "project:graph:read",
  "project:graph:write", "settings:read", "action:execute"
] as const;

const metadataSchema: PluginMiniSchema = { type: "object", properties: {}, additionalProperties: true };
const warningSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    code: { type: "string", maxLength: 80 },
    path: { type: "string", maxLength: 500 },
    detail: { type: "string", maxLength: 500 }
  },
  required: ["code"],
  additionalProperties: false
};
const freshnessSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    generatedAt: { type: "string", maxLength: 80 },
    rootId: { type: "string", maxLength: 80 },
    projectId: { type: "string", maxLength: 120 },
    source: { type: "string", maxLength: 80 },
    nodeCount: { type: "integer", minimum: 0, maximum: 100000 },
    edgeCount: { type: "integer", minimum: 0, maximum: 100000 }
  },
  required: ["generatedAt", "rootId", "projectId", "source", "nodeCount", "edgeCount"],
  additionalProperties: false
};
const nodeSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    id: { type: "string", maxLength: 500 },
    kind: { type: "string", maxLength: 80 },
    label: { type: "string", maxLength: 500 },
    path: { type: "string", maxLength: 500 },
    language: { type: "string", maxLength: 80 },
    symbolName: { type: "string", maxLength: 500 },
    lineStart: { type: "integer", minimum: 0 },
    lineEnd: { type: "integer", minimum: 0 },
    safeSignature: { type: "string", maxLength: 1000 },
    metadata: metadataSchema
  },
  required: ["id", "kind", "label"],
  additionalProperties: false
};
const edgeSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    id: { type: "string", maxLength: 500 },
    from: { type: "string", maxLength: 500 },
    to: { type: "string", maxLength: 500 },
    kind: { type: "string", maxLength: 80 },
    weight: { type: "number", minimum: 0 },
    evidence: {
      type: "object",
      properties: {
        path: { type: "string", maxLength: 500 },
        lineStart: { type: "integer", minimum: 0 },
        lineEnd: { type: "integer", minimum: 0 },
        extractor: { type: "string", maxLength: 120 },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["extractor", "confidence"],
      additionalProperties: false
    }
  },
  required: ["id", "from", "to", "kind"],
  additionalProperties: false
};
const graphQueryOutputSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    results: { type: "array", items: nodeSchema, maxLength: 50 },
    warnings: { type: "array", items: warningSchema, maxLength: 20 },
    freshness: freshnessSchema
  },
  required: ["results"],
  additionalProperties: false
};
const graphNeighborhoodOutputSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    nodes: { type: "array", items: nodeSchema, maxLength: 100 },
    edges: { type: "array", items: edgeSchema, maxLength: 200 },
    warnings: { type: "array", items: warningSchema, maxLength: 20 },
    freshness: freshnessSchema
  },
  required: ["nodes", "edges"],
  additionalProperties: false
};
const graphDeleteOutputSchema: PluginMiniSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    error: { type: "string", maxLength: 80 }
  },
  additionalProperties: false
};

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
      outputSchema: graphQueryOutputSchema,
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
      outputSchema: graphNeighborhoodOutputSchema,
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
      outputSchema: graphDeleteOutputSchema,
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
