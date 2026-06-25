import { descriptor as contextCompressorDescriptor, plugin as contextCompressorPlugin } from "../../../plugins/context-compressor-plugin/plugin.ts";
import { descriptor as obsidianGraphDescriptor, plugin as obsidianGraphPlugin } from "../../../plugins/obsidian-graph-plugin/plugin.ts";
import type { MolenkopfPluginModule } from "./plugin-api.ts";
import type { PluginDescriptor } from "./plugin-descriptor.ts";

export const builtinPluginDescriptors: PluginDescriptor[] = [
  contextCompressorDescriptor,
  obsidianGraphDescriptor
];

export const builtinPluginModules: Record<string, MolenkopfPluginModule> = {
  [contextCompressorDescriptor.id]: contextCompressorPlugin,
  [obsidianGraphDescriptor.id]: obsidianGraphPlugin
};
