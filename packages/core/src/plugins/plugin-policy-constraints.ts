import type { PluginDescriptorV2, PluginRisk } from "./plugin-descriptor-v2.ts";
import type { PluginMiniSchema, PluginSettingMergeStrategy } from "./plugin-settings-schema.ts";
import type { PluginPolicyOverrides, PluginPolicyStore } from "./plugin-policy.ts";
import { defaultPluginSettings, normalizePluginSettings, validatePluginSettings } from "./plugin-settings-schema.ts";

const RISK_ORDER: readonly PluginRisk[] = ["green", "yellow", "orange", "red"];
const RISK_INDEX = new Map<PluginRisk, number>(RISK_ORDER.map((value, index) => [value, index]));

export type PluginPolicyConstraintResult = { ok: true } | { ok: false; errors: string[] };

export function validatePluginPolicyConstraints(
  state: PluginPolicyStore,
  descriptors: readonly PluginDescriptorV2[]
): PluginPolicyConstraintResult {
  const errors: string[] = [];
  for (const descriptor of descriptors) {
    const global = state.globalPluginPolicy[descriptor.id];
    if (global) validateOverride(errors, descriptor, globalBase(descriptor), global, `global:${descriptor.id}`);
  }
  for (const team of state.teamPluginPolicies) {
    const descriptor = descriptors.find((item) => item.id === team.pluginId);
    if (!descriptor) continue;
    const parent = mergeParent(descriptor, state.globalPluginPolicy[team.pluginId]);
    validateOverride(errors, descriptor, parent, team.overrides, `team:${team.teamId}:${team.pluginId}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

type PolicyParent = {
  enabled: boolean;
  maxRisk: PluginRisk;
  capabilities: readonly string[];
  actions: readonly string[];
  settings: Record<string, unknown>;
};

function descriptorBase(descriptor: PluginDescriptorV2): PolicyParent {
  return {
    enabled: descriptor.defaultPolicy.enabled,
    maxRisk: descriptor.risk,
    capabilities: descriptor.capabilities,
    actions: descriptor.actions.map((item) => item.id),
    settings: defaultPluginSettings(descriptor.settingsSchema) as Record<string, unknown>
  };
}

function globalBase(descriptor: PluginDescriptorV2): PolicyParent {
  return { ...descriptorBase(descriptor), enabled: true };
}

function mergeParent(descriptor: PluginDescriptorV2, global: PluginPolicyOverrides | undefined): PolicyParent {
  const base = descriptorBase(descriptor);
  return {
    enabled: global?.enabled ?? base.enabled,
    maxRisk: clampRisk(base.maxRisk, global?.maxRisk),
    capabilities: global?.capabilities !== undefined ? base.capabilities.filter((item) => global.capabilities?.includes(item)) : [...base.capabilities],
    actions: global?.actions !== undefined ? base.actions.filter((item) => global.actions?.includes(item)) : [...base.actions],
    settings: mergeSettingsParent(descriptor.settingsSchema, base.settings, global?.settings)
  };
}

function validateOverride(
  errors: string[],
  descriptor: PluginDescriptorV2,
  parent: PolicyParent,
  override: PluginPolicyOverrides,
  scope: string
): void {
  if (override.enabled === true && parent.enabled === false) errors.push(`${scope}:enabled`);
  if (override.maxRisk && riskAbove(override.maxRisk, parent.maxRisk)) errors.push(`${scope}:maxRisk`);
  if (override.capabilities?.some((value) => !parent.capabilities.includes(value))) errors.push(`${scope}:capabilities`);
  if (override.actions?.some((value) => !parent.actions.includes(value))) errors.push(`${scope}:actions`);
  if (override.settings) validateSettingOverride(errors, descriptor.settingsSchema, parent.settings, override.settings, scope, "");
}

function validateSettingOverride(
  errors: string[],
  schema: PluginMiniSchema,
  parentValue: unknown,
  overrideValue: unknown,
  scope: string,
  path: string
): void {
  const validated = validatePluginSettings(schema, overrideValue);
  if (!validated.ok) {
    errors.push(`${scope}:settings${path ? `.${path}` : ""}`);
    return;
  }
  if (schema.type === "object") {
    const parent = asRecord(parentValue);
    const child = asRecord(overrideValue);
    for (const [key, next] of Object.entries(child)) {
      const childSchema = schema.properties[key];
      if (!childSchema) {
        errors.push(`${scope}:settings.${joinPath(path, key)}`);
        continue;
      }
      validateSettingOverride(errors, childSchema, parent[key], next, scope, joinPath(path, key));
    }
    return;
  }
  const strategy = schema.restrictiveMerge ?? defaultStrategy(schema.type);
  if (strategy === "inheritOnly") {
    errors.push(`${scope}:settings${path ? `.${path}` : ""}`);
    return;
  }
  if ((schema.type === "integer" || schema.type === "number") && typeof parentValue === "number" && typeof overrideValue === "number") {
    if (strategy === "minWins" && overrideValue > parentValue) errors.push(`${scope}:settings.${path}`);
    if (strategy === "maxWins" && overrideValue < parentValue) errors.push(`${scope}:settings.${path}`);
    return;
  }
  if (schema.type === "boolean" && strategy === "falseWins" && parentValue === false && overrideValue === true) {
    errors.push(`${scope}:settings.${path}`);
    return;
  }
  if (schema.type === "array" && strategy === "intersection" && Array.isArray(parentValue) && Array.isArray(overrideValue)) {
    if (overrideValue.some((item) => !parentValue.includes(item))) errors.push(`${scope}:settings.${path}`);
    return;
  }
  if (schema.type === "enum" && strategy === "orderedMax") {
    const order = schema.orderedValues ?? schema.values;
    const parentIndex = order.indexOf(String(parentValue));
    const overrideIndex = order.indexOf(String(overrideValue));
    if (parentIndex >= 0 && overrideIndex > parentIndex) errors.push(`${scope}:settings.${path}`);
  }
}

function defaultStrategy(type: PluginMiniSchema["type"]): PluginSettingMergeStrategy {
  if (type === "boolean") return "falseWins";
  if (type === "array") return "intersection";
  if (type === "integer" || type === "number") return "minWins";
  if (type === "enum") return "orderedMax";
  return "inheritOnly";
}

function mergeSettingsParent(schema: PluginMiniSchema, parentValue: unknown, overrideValue: unknown): Record<string, unknown> {
  if (schema.type !== "object") return asRecord(parentValue);
  const out: Record<string, unknown> = {};
  const parent = asRecord(parentValue);
  const child = asRecord(overrideValue);
  for (const [key, childSchema] of Object.entries(schema.properties)) {
    const base = parent[key];
    const next = child[key];
    out[key] = mergeSettingValue(childSchema, base, next);
  }
  return out;
}

function mergeSettingValue(schema: PluginMiniSchema, parentValue: unknown, overrideValue: unknown): unknown {
  if (overrideValue === undefined) return parentValue;
  if (schema.type === "object") return mergeSettingsParent(schema, parentValue, overrideValue);
  const override = normalizePluginSettings(schema, overrideValue);
  const strategy = schema.restrictiveMerge ?? defaultStrategy(schema.type);
  if (strategy === "inheritOnly") return parentValue;
  if (schema.type === "boolean" && strategy === "falseWins") return parentValue === false ? false : override;
  if ((schema.type === "integer" || schema.type === "number") && typeof parentValue === "number" && typeof override === "number") {
    if (strategy === "minWins") return Math.min(parentValue, override);
    if (strategy === "maxWins") return Math.max(parentValue, override);
  }
  if (schema.type === "array" && strategy === "intersection" && Array.isArray(parentValue) && Array.isArray(override)) {
    return override.filter((item) => parentValue.includes(item));
  }
  if (schema.type === "enum" && strategy === "orderedMax") {
    const order = schema.orderedValues ?? schema.values;
    const parentIndex = order.indexOf(String(parentValue));
    const overrideIndex = order.indexOf(String(override));
    if (parentIndex >= 0 && overrideIndex >= 0) return order[Math.min(parentIndex, overrideIndex)];
  }
  return override;
}

function clampRisk(parent: PluginRisk, candidate: PluginRisk | undefined): PluginRisk {
  if (!candidate) return parent;
  return riskAbove(candidate, parent) ? parent : candidate;
}

function riskAbove(value: PluginRisk, parent: PluginRisk): boolean {
  return (RISK_INDEX.get(value) ?? 0) > (RISK_INDEX.get(parent) ?? 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}
