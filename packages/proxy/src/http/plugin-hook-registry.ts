import type { PluginCapability } from "../../../core/src/plugins/plugin-descriptor-v2.ts";

export type PluginHookPhase =
  | "onRequestMetadata"
  | "onRequestBody"
  | "onAudit"
  | "onEvent"
  | "getData"
  | "action";

export type PluginHookDefinition = {
  phase: PluginHookPhase;
  requiredCapabilities: readonly PluginCapability[];
  allowsMutation: boolean;
};

export const pluginHookRegistry: readonly PluginHookDefinition[] = [
  { phase: "onRequestMetadata", requiredCapabilities: ["metadata:read"], allowsMutation: false },
  { phase: "onRequestBody", requiredCapabilities: ["body:redacted:read", "body:write"], allowsMutation: true },
  { phase: "onAudit", requiredCapabilities: ["audit:write"], allowsMutation: false },
  { phase: "onEvent", requiredCapabilities: ["events:write"], allowsMutation: false },
  { phase: "getData", requiredCapabilities: ["audit:read:scoped"], allowsMutation: false },
  { phase: "action", requiredCapabilities: ["action:execute"], allowsMutation: false }
];

export function hookDefinition(phase: PluginHookPhase): PluginHookDefinition | undefined {
  return pluginHookRegistry.find((item) => item.phase === phase);
}
