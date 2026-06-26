import { descriptor as contextCompressorDescriptor } from "../../../plugins/context-compressor-plugin/descriptor.ts";
import { descriptor as obsidianGraphDescriptor } from "../../../plugins/obsidian-graph-plugin/descriptor.ts";
import type { PluginDescriptor } from "./plugin-descriptor.ts";

export { contextCompressorDescriptor, obsidianGraphDescriptor };

export const builtinPluginDescriptors: PluginDescriptor[] = [
  contextCompressorDescriptor,
  obsidianGraphDescriptor
];
