import type { PluginRuntimeHook, PluginTrafficAccess, PluginType } from "./plugin-descriptor.ts";
import type { PluginPermission } from "./plugin-sdk.ts";

export type BuiltinPluginRuntimeMetadata = {
  type: PluginType;
  description: string;
  traffic: PluginTrafficAccess;
  permissions: readonly PluginPermission[];
  hooks: readonly PluginRuntimeHook[];
  defaultEnabled: boolean;
  canDisable: true;
};
