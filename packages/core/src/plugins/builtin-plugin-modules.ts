import { plugin as contextCompressorPlugin } from "../../../plugins/context-compressor-plugin/plugin.ts";
import { plugin as obsidianGraphPlugin } from "../../../plugins/obsidian-graph-plugin/plugin.ts";
import type { MolenkopfPluginModule } from "./plugin-api.ts";
import { contextCompressorDescriptor, obsidianGraphDescriptor } from "./builtin-plugin-descriptors.ts";

export const builtinPluginModules: Record<string, MolenkopfPluginModule> = {
  [contextCompressorDescriptor.id]: contextCompressorPlugin,
  [obsidianGraphDescriptor.id]: obsidianGraphPlugin
};
