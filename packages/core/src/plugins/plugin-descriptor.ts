import type { PluginPermission } from "./plugin-sdk.ts";
import { builtinPluginDescriptors as descriptors } from "./builtin-plugin-modules.ts";
import { staticPluginPipeline } from "./static-pipeline.ts";

export type PluginCategory = "safety" | "compression" | "storage" | "events" | "routing" | "visualization";
export type PluginDataScope = "metrics" | "audit-summary" | "requests" | "memory-graph";
export type PluginType = "observer" | "classifier" | "redactor" | "transformer" | "retriever" | "router" | "auditor" | "stream-filter";
export type PluginTrafficMutation = "none" | "mask" | "transform" | "augment-context" | "route" | "block" | "audit-log" | "event-filter";
export type PluginRuntimeHook =
  | "request:metadata"
  | "request:body:rewrite"
  | "audit:manifest"
  | "events:lifecycle"
  | "provider:route"
  | "workspace:local-page";

export type PluginTogglePolicy = {
  defaultEnabled: boolean;
  canDisable: true;
};

export type PluginWorkspace = {
  pagePath: string;
  dataPath: string;
  dataScopes: PluginDataScope[];
};

export type PluginTrafficAccess = {
  reads: ("metadata" | "redacted-body" | "body" | "audit" | "events")[];
  mutates: PluginTrafficMutation[];
};

export type PluginDescriptor = {
  id: string;
  name: string;
  type: PluginType;
  category: PluginCategory;
  description: string;
  traffic: PluginTrafficAccess;
  permissions: PluginPermission[];
  hooks: PluginRuntimeHook[];
  toggle: PluginTogglePolicy;
  modulePath?: string;
  workspace?: PluginWorkspace;
  pipelineIndex?: number;
};

export const builtinPluginDescriptors: PluginDescriptor[] = descriptors.map((plugin) => {
  const pipelineIndex = (staticPluginPipeline as readonly string[]).indexOf(plugin.id);
  return pipelineIndex >= 0 ? { ...plugin, pipelineIndex } : plugin;
});
