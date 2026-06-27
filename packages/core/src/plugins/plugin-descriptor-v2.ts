import type { PluginMiniSchema } from "./plugin-settings-schema.ts";

export const pluginDescriptorVersion = 2 as const;

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
  | "action:execute";

export type PluginCategory = "safety" | "compression" | "storage" | "events" | "routing" | "visualization";
export type PluginDataScope = "metrics" | "audit-summary" | "requests" | "memory-graph";

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

export type PluginWorkspace = {
  pagePath?: string;
  dataPath?: string;
};

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

export function validatePluginDescriptorV2(descriptor: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!descriptor || typeof descriptor !== "object") return { ok: false, errors: ["descriptor-missing"] };
  const value = descriptor as Record<string, unknown>;
  if (value.descriptorVersion !== pluginDescriptorVersion) errors.push("descriptorVersion-must-be-2");
  requireString(value, "id", errors);
  requireString(value, "name", errors);
  if (!isCategory(value.category)) errors.push("category-invalid");
  if (!isRisk(value.risk)) errors.push("risk-invalid");
  if (!Array.isArray(value.capabilities)) errors.push("capabilities-must-be-array");
  else if (!value.capabilities.every((capability) => isCapability(capability))) errors.push("capabilities-invalid");
  if (!Array.isArray(value.actions)) errors.push("actions-must-be-array");
  if (!isDefaultPolicy(value.defaultPolicy)) errors.push("defaultPolicy-must-be-valid");
  if (value.dataScopes && !Array.isArray(value.dataScopes)) errors.push("dataScopes-must-be-array");
  else if (Array.isArray(value.dataScopes) && !value.dataScopes.every((scope) => isDataScope(scope))) {
    errors.push("dataScopes-invalid");
  }
  if (value.modulePath !== undefined && typeof value.modulePath !== "string") errors.push("modulePath-must-be-string");
  if (!value.modulePath && hasRuntimeInterface(value)) errors.push("modulePath-required");
  if (value.workspace && !isWorkspace(value.workspace)) errors.push("workspace-invalid");

  if (Array.isArray(value.actions)) {
    for (const action of value.actions) {
      const actionErrors = validateAction(action as Record<string, unknown>);
      for (const error of actionErrors) errors.push(`action:${error}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateAction(action: Record<string, unknown>): string[] {
  const actionErrors: string[] = [];
  requireString(action, "id", actionErrors);
  requireString(action, "label", actionErrors);
  requireString(action, "description", actionErrors);
  if (!Array.isArray(action.requiredCapabilities) || action.requiredCapabilities.length === 0) actionErrors.push("requiredCapabilities-empty");
  else if (!action.requiredCapabilities.every((capability) => isCapability(capability))) actionErrors.push("requiredCapabilities-invalid");
  if (!isRole(action.requiredRole)) actionErrors.push("requiredRole-invalid");
  if (!isRisk(action.risk)) actionErrors.push("risk-invalid");
  if (!action.inputSchema || typeof action.inputSchema !== "object") actionErrors.push("inputSchema-required");
  if (!action.outputSchema || typeof action.outputSchema !== "object") actionErrors.push("outputSchema-required");
  if (typeof action.confirmation !== "string" || !PLUGIN_ACTION_CONFIRMATIONS.has(action.confirmation as PluginActionConfirmation)) {
    actionErrors.push("confirmation-invalid");
  }
  if (!Array.isArray(action.sideEffects) || action.sideEffects.length === 0) actionErrors.push("sideEffects-empty");
  const sideEffects = action.sideEffects as unknown[];
  if (sideEffects.includes("none") && sideEffects.length > 1) actionErrors.push("sideEffect-none-combination");
  if (!sideEffects.every((sideEffect) => isSideEffect(sideEffect))) actionErrors.push("sideEffect-invalid");
  if (typeof action.auditEvent !== "boolean") actionErrors.push("auditEvent-required");
  if (typeof action.outputSafety !== "string" || !PLUGIN_ACTION_OUTPUT_SAFETY.has(action.outputSafety as PluginActionOutputSafety)) {
    actionErrors.push("outputSafety-invalid");
  }
  return actionErrors;
}

function isWorkspace(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Record<string, unknown>;
  if (workspace.pagePath !== undefined && (typeof workspace.pagePath !== "string" || !workspace.pagePath.startsWith("/"))) return false;
  if (workspace.dataPath !== undefined && typeof workspace.dataPath !== "string") return false;
  return true;
}

function isCategory(value: unknown): value is PluginCategory {
  return typeof value === "string" && PLUGIN_CATEGORY_SET.has(value as PluginCategory);
}

function isRisk(value: unknown): value is PluginRisk {
  return typeof value === "string" && PLUGIN_RISK_SET.has(value as PluginRisk);
}

function isCapability(value: unknown): value is PluginCapability {
  return typeof value === "string" && PLUGIN_CAPABILITIES.has(value as PluginCapability);
}

function isDataScope(value: unknown): value is PluginDataScope {
  return typeof value === "string" && PLUGIN_DATA_SCOPES.has(value as PluginDataScope);
}

function isSideEffect(value: unknown): value is PluginActionSideEffect {
  return typeof value === "string" && PLUGIN_ACTION_SIDE_EFFECTS.has(value as PluginActionSideEffect);
}

function isRole(value: unknown): value is PluginRole {
  return value === "member" || value === "manager" || value === "admin";
}

function requireString(obj: Record<string, unknown>, key: string, errors: string[], allowed: (value: string) => boolean = () => true): void {
  const value = obj[key];
  if (typeof value !== "string" || !allowed(value)) errors.push(`${key}-invalid`);
}

const PLUGIN_CATEGORIES: PluginDescriptorV2["category"][] = ["safety", "compression", "storage", "events", "routing", "visualization"];
const PLUGIN_CATEGORY_SET = new Set<PluginCategory>(PLUGIN_CATEGORIES);
const PLUGIN_CAPABILITIES = new Set<PluginCapability>([
  "metadata:read", "body:redacted:read", "body:write", "audit:read:scoped", "audit:read:all", "audit:write",
  "events:write", "settings:read", "settings:write", "policy:recommend", "policy:write", "action:execute"
]);
const PLUGIN_RISKS: PluginRisk[] = ["green", "yellow", "orange", "red"];
const PLUGIN_RISK_SET = new Set<PluginRisk>(PLUGIN_RISKS);
const PLUGIN_DATA_SCOPES: Set<PluginDataScope> = new Set(["metrics", "audit-summary", "requests", "memory-graph"]);
const PLUGIN_ACTION_SIDE_EFFECTS: Set<PluginActionSideEffect> = new Set([
  "settings",
  "policy",
  "storage",
  "event",
  "traffic",
  "none",
]);

const PLUGIN_ACTION_CONFIRMATIONS = new Set(["none", "required", "typed"] as const);
const PLUGIN_ACTION_OUTPUT_SAFETY = new Set(["strict", "adminSafe"] as const);

function hasRuntimeInterface(value: Record<string, unknown>): boolean {
  const hasData = Array.isArray(value.dataScopes) && value.dataScopes.length > 0;
  const hasActions = Array.isArray(value.actions) && value.actions.length > 0;
  return hasData || hasActions;
}

function isDefaultPolicy(value: unknown): value is PluginDefaultPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Record<string, unknown>;
  return (
    typeof policy.enabled === "boolean"
    && isRisk(policy.maxRisk)
    && Array.isArray(policy.capabilities)
    && policy.capabilities.every((capability) => isCapability(capability))
    && Array.isArray(policy.actions)
    && typeof policy.settings === "object"
  );
}
