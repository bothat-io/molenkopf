import { descriptorV2 as contextCompressorDescriptorV2, runtimeMetadata as contextCompressorRuntime } from "../../../plugins/context-compressor-plugin/descriptor-v2.ts";
import { descriptorV2 as obsidianGraphDescriptorV2, runtimeMetadata as obsidianGraphRuntime } from "../../../plugins/obsidian-graph-plugin/descriptor-v2.ts";
import { descriptorV2 as projectGraphDescriptorV2, runtimeMetadata as projectGraphRuntime } from "../../../plugins/project-graph-plugin/descriptor-v2.ts";
import { descriptorV2 as tokenOptimizerDescriptorV2, runtimeMetadata as tokenOptimizerRuntime } from "../../../plugins/token-optimizer-plugin/descriptor-v2.ts";
import type { PluginDataScope, PluginDescriptor } from "./plugin-descriptor.ts";

export const contextCompressorDescriptor: PluginDescriptor = toLegacyDescriptor(contextCompressorDescriptorV2, contextCompressorRuntime);
export const obsidianGraphDescriptor: PluginDescriptor = toLegacyDescriptor(obsidianGraphDescriptorV2, obsidianGraphRuntime);
export const projectGraphDescriptor: PluginDescriptor = toLegacyDescriptor(projectGraphDescriptorV2, projectGraphRuntime);
export const tokenOptimizerDescriptor: PluginDescriptor = toLegacyDescriptor(tokenOptimizerDescriptorV2, tokenOptimizerRuntime);

export const builtinPluginDescriptors: PluginDescriptor[] = [
  contextCompressorDescriptor,
  obsidianGraphDescriptor,
  projectGraphDescriptor,
  tokenOptimizerDescriptor
];

function toLegacyDescriptor(
  descriptor: {
    id: string;
    name: string;
    category: PluginDescriptor["category"];
    modulePath?: string;
    workspace?: { pagePath?: string; dataPath?: string };
    dataScopes?: readonly PluginDataScope[];
  },
  runtime: {
    type: PluginDescriptor["type"];
    description: string;
    traffic: PluginDescriptor["traffic"];
    permissions: readonly PluginDescriptor["permissions"][number][];
    hooks: readonly PluginDescriptor["hooks"][number][];
    defaultEnabled: boolean;
    canDisable: true;
  }
): PluginDescriptor {
  return {
    id: descriptor.id,
    name: descriptor.name,
    type: runtime.type,
    category: descriptor.category,
    description: runtime.description,
    traffic: { reads: [...runtime.traffic.reads], mutates: [...runtime.traffic.mutates] },
    permissions: [...runtime.permissions],
    hooks: [...runtime.hooks],
    toggle: { defaultEnabled: runtime.defaultEnabled, canDisable: runtime.canDisable },
    modulePath: descriptor.modulePath,
    workspace: descriptor.workspace?.pagePath || descriptor.workspace?.dataPath ? {
      pagePath: descriptor.workspace.pagePath ?? "",
      dataPath: descriptor.workspace.dataPath ?? "",
      dataScopes: [...(descriptor.dataScopes ?? [])]
    } : undefined
  };
}
