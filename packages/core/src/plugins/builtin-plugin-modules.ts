import { plugin as contextCompressorPlugin } from "../../../plugins/context-compressor-plugin/plugin.ts";
import { plugin as projectGraphPlugin } from "../../../plugins/project-graph-plugin/plugin.ts";
import { plugin as tokenOptimizerPlugin } from "../../../plugins/token-optimizer-plugin/plugin.ts";
import type { MolenkopfPluginModule } from "./plugin-api.ts";
import { contextCompressorDescriptorV2, projectGraphDescriptorV2, tokenOptimizerDescriptorV2 } from "./builtin-plugin-descriptors-v2.ts";

export const builtinPluginModules: Record<string, MolenkopfPluginModule> = {
  [contextCompressorDescriptorV2.id]: contextCompressorPlugin,
  [projectGraphDescriptorV2.id]: projectGraphPlugin,
  [tokenOptimizerDescriptorV2.id]: tokenOptimizerPlugin
};
