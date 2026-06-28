import {
  pluginDescriptorVersion,
  type PluginActionConfirmation,
  type PluginActionDescriptor,
  type PluginActionOutputSafety,
  type PluginActionSideEffect,
  type PluginCapability,
  type PluginCategory,
  type PluginDataScope,
  type PluginDefaultPolicy,
  type PluginDescriptorV2,
  type PluginRisk,
  type PluginRole
} from "./plugin-descriptor-v2.ts";

const PLUGIN_CATEGORIES: PluginDescriptorV2["category"][] = ["safety", "compression", "storage", "events", "routing", "visualization"];
const PLUGIN_CATEGORY_SET = new Set<PluginCategory>(PLUGIN_CATEGORIES);
const PLUGIN_CAPABILITIES = new Set<PluginCapability>([
  "metadata:read", "body:redacted:read", "body:write", "audit:read:scoped", "audit:read:all", "audit:write",
  "events:write", "settings:read", "settings:write", "policy:recommend", "policy:write",
  "project:roots:read", "project:files:discover", "project:files:read", "project:graph:read",
  "project:graph:write", "project:graph:export", "action:execute"
]);
const PLUGIN_RISK_SET = new Set<PluginRisk>(["green", "yellow", "orange", "red"]);
const PLUGIN_DATA_SCOPES = new Set<PluginDataScope>(["metrics", "audit-summary", "requests", "memory-graph", "project-graph", "routes", "symbols"]);
const PLUGIN_ACTION_SIDE_EFFECTS = new Set<PluginActionSideEffect>(["settings", "policy", "storage", "event", "traffic", "none"]);
const PLUGIN_ACTION_CONFIRMATIONS = new Set<PluginActionConfirmation>(["none", "required", "typed"]);
const PLUGIN_ACTION_OUTPUT_SAFETY = new Set<PluginActionOutputSafety>(["strict", "adminSafe"]);

export function validatePluginDescriptorV2(descriptor: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!descriptor || typeof descriptor !== "object") return { ok: false, errors: ["descriptor-missing"] };
  const value = descriptor as Record<string, unknown>;
  if (value.descriptorVersion !== pluginDescriptorVersion) errors.push("descriptorVersion-must-be-2");
  requireString(value, "id", errors);
  requireString(value, "name", errors);
  if (!isCategory(value.category)) errors.push("category-invalid");
  if (!isRisk(value.risk)) errors.push("risk-invalid");
  validateArray(value.capabilities, isCapability, "capabilities", errors);
  validateArray(value.actions, isActionObject, "actions", errors);
  if (!isDefaultPolicy(value.defaultPolicy)) errors.push("defaultPolicy-must-be-valid");
  if (value.dataScopes !== undefined) validateArray(value.dataScopes, isDataScope, "dataScopes", errors);
  if (value.modulePath !== undefined && typeof value.modulePath !== "string") errors.push("modulePath-must-be-string");
  if (!value.modulePath && hasRuntimeInterface(value)) errors.push("modulePath-required");
  if (value.workspace && !isWorkspace(value.workspace)) errors.push("workspace-invalid");
  for (const action of Array.isArray(value.actions) ? value.actions : []) {
    for (const error of validateAction(action as Record<string, unknown>)) errors.push(`action:${error}`);
  }
  return { ok: errors.length === 0, errors };
}

function validateAction(action: Record<string, unknown>): string[] {
  const errors: string[] = [];
  requireString(action, "id", errors);
  requireString(action, "label", errors);
  requireString(action, "description", errors);
  validateNonEmptyArray(action.requiredCapabilities, isCapability, "requiredCapabilities", errors);
  if (!isRole(action.requiredRole)) errors.push("requiredRole-invalid");
  if (!isRisk(action.risk)) errors.push("risk-invalid");
  if (!action.inputSchema || typeof action.inputSchema !== "object") errors.push("inputSchema-required");
  if (!action.outputSchema || typeof action.outputSchema !== "object") errors.push("outputSchema-required");
  if (!PLUGIN_ACTION_CONFIRMATIONS.has(action.confirmation as PluginActionConfirmation)) errors.push("confirmation-invalid");
  validateNonEmptyArray(action.sideEffects, isSideEffect, "sideEffects", errors);
  const sideEffects = Array.isArray(action.sideEffects) ? action.sideEffects : [];
  if (sideEffects.includes("none") && sideEffects.length > 1) errors.push("sideEffect-none-combination");
  if (typeof action.auditEvent !== "boolean") errors.push("auditEvent-required");
  if (!PLUGIN_ACTION_OUTPUT_SAFETY.has(action.outputSafety as PluginActionOutputSafety)) errors.push("outputSafety-invalid");
  return errors;
}

function validateArray(value: unknown, check: (item: unknown) => boolean, field: string, errors: string[]) {
  if (!Array.isArray(value)) errors.push(`${field}-must-be-array`);
  else if (!value.every((item) => check(item))) errors.push(`${field}-invalid`);
}

function validateNonEmptyArray(value: unknown, check: (item: unknown) => boolean, field: string, errors: string[]) {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${field}-empty`);
  else if (!value.every((item) => check(item))) errors.push(`${field}-invalid`);
}

function isWorkspace(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Record<string, unknown>;
  return validPagePath(workspace.pagePath) && validDataPath(workspace.dataPath);
}

function validPagePath(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.startsWith("/"));
}

function validDataPath(value: unknown): boolean {
  return value === undefined || typeof value === "string";
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

function isActionObject(value: unknown): value is PluginActionDescriptor {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireString(obj: Record<string, unknown>, key: string, errors: string[]) {
  if (typeof obj[key] !== "string") errors.push(`${key}-invalid`);
}

function hasRuntimeInterface(value: Record<string, unknown>): boolean {
  return (Array.isArray(value.dataScopes) && value.dataScopes.length > 0) || (Array.isArray(value.actions) && value.actions.length > 0);
}

function isDefaultPolicy(value: unknown): value is PluginDefaultPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Record<string, unknown>;
  return typeof policy.enabled === "boolean"
    && isRisk(policy.maxRisk)
    && Array.isArray(policy.capabilities)
    && policy.capabilities.every((item) => isCapability(item))
    && Array.isArray(policy.actions)
    && typeof policy.settings === "object";
}
