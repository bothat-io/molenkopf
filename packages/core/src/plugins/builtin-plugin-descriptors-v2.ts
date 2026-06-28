import { descriptorV2 as contextCompressorDescriptorV2 } from "../../../plugins/context-compressor-plugin/descriptor-v2.ts";
import { descriptorV2 as projectGraphDescriptorV2 } from "../../../plugins/project-graph-plugin/descriptor-v2.ts";
import { descriptorV2 as tokenOptimizerDescriptorV2 } from "../../../plugins/token-optimizer-plugin/descriptor-v2.ts";
import type { PluginDescriptorV2 } from "./plugin-descriptor-v2.ts";

export { contextCompressorDescriptorV2, projectGraphDescriptorV2, tokenOptimizerDescriptorV2 };

export const builtinPluginDescriptorsV2: readonly PluginDescriptorV2[] = [
  contextCompressorDescriptorV2,
  projectGraphDescriptorV2,
  tokenOptimizerDescriptorV2
];
