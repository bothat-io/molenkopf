import { builtinPluginDescriptors, type PluginCategory, type PluginDataScope, type PluginRuntimeHook, type PluginTrafficAccess, type PluginType } from "./plugin-descriptor.ts";
import type { PluginPermission } from "./plugin-sdk.ts";

export type MolenkopfPlugin = {
  id: string;
  name: string;
  type: PluginType;
  category: PluginCategory;
  description: string;
  traffic: PluginTrafficAccess;
  enabledByDefault: boolean;
  canToggle: boolean;
  permissions: PluginPermission[];
  hooks: PluginRuntimeHook[];
  modulePath?: string;
  pagePath?: string;
  dataPath?: string;
  dataScopes?: PluginDataScope[];
  pipelineIndex?: number;
};

export const pluginCatalog: MolenkopfPlugin[] = builtinPluginDescriptors.map((plugin) => ({
  id: plugin.id,
  name: plugin.name,
  type: plugin.type,
  category: plugin.category,
  description: plugin.description,
  traffic: { reads: [...plugin.traffic.reads], mutates: [...plugin.traffic.mutates] },
  permissions: [...plugin.permissions],
  hooks: [...plugin.hooks],
  modulePath: plugin.modulePath,
  enabledByDefault: plugin.toggle.defaultEnabled,
  canToggle: plugin.toggle.canDisable,
  pagePath: plugin.workspace?.pagePath,
  dataPath: plugin.workspace?.dataPath,
  dataScopes: plugin.workspace ? [...plugin.workspace.dataScopes] : undefined,
  pipelineIndex: plugin.pipelineIndex
}));

export function findPlugin(id: string): MolenkopfPlugin | undefined {
  return pluginCatalog.find((plugin) => plugin.id === id);
}
