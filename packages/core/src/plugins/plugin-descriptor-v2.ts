import type { PluginMiniSchema } from "./plugin-settings-schema.ts";
import { validatePluginDescriptorV2 } from "./plugin-descriptor-v2-validate.ts";

export { pluginDescriptorVersion } from "./plugin-descriptor-v2-constants.ts";

export type PluginRisk = "green" | "yellow" | "orange" | "red";
export type PluginCapability =
  | "metadata:read"
  | "body:redacted:read"
  | "body:write"
  | "audit:read:scoped"
  | "audit:read:all"
  | "audit:write"
  | "events:write"
  | "settings:read"
  | "settings:write"
  | "policy:recommend"
  | "policy:write"
  | "project:roots:read"
  | "project:files:discover"
  | "project:files:read"
  | "project:graph:read"
  | "project:graph:write"
  | "project:graph:export"
  | "action:execute";
export type PluginCategory = "safety" | "compression" | "storage" | "events" | "routing" | "visualization";
export type PluginDataScope = "metrics" | "audit-summary" | "requests" | "memory-graph" | "project-graph" | "routes" | "symbols";
export type PluginActionSideEffect = "settings" | "policy" | "storage" | "event" | "traffic" | "none";
export type PluginActionOutputSafety = "strict" | "adminSafe";
export type PluginActionConfirmation = "none" | "required" | "typed";
export type PluginRole = "member" | "manager" | "admin";

export type PluginActionDescriptor = {
  id: string;
  label: string;
  description: string;
  requiredCapabilities: readonly PluginCapability[];
  requiredRole: PluginRole;
  risk: PluginRisk;
  inputSchema: PluginMiniSchema;
  outputSchema: PluginMiniSchema;
  confirmation: PluginActionConfirmation;
  sideEffects: readonly PluginActionSideEffect[];
  auditEvent: boolean;
  outputSafety: PluginActionOutputSafety;
};

export type PluginDefaultPolicy = {
  enabled: boolean;
  maxRisk: PluginRisk;
  capabilities: readonly PluginCapability[];
  settings: PluginMiniSchema;
  actions: readonly string[];
};

export type PluginWorkspace = { pagePath?: string; dataPath?: string };
export type PluginDescriptorV2 = {
  descriptorVersion: 2;
  id: string;
  name: string;
  category: PluginCategory;
  risk: PluginRisk;
  capabilities: readonly PluginCapability[];
  settingsSchema: PluginMiniSchema;
  actions: readonly PluginActionDescriptor[];
  defaultPolicy: PluginDefaultPolicy;
  workspace?: PluginWorkspace;
  dataScopes?: readonly PluginDataScope[];
  modulePath?: string;
};

export { validatePluginDescriptorV2 };
