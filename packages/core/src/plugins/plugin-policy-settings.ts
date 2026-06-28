import {
  defaultPluginSettings,
  normalizePluginSettings,
  validatePluginSettings,
  type PluginMiniEnumSchema,
  type PluginMiniSchema,
  type PluginSettingMergeStrategy
} from "./plugin-settings-schema.ts";
import type { PolicyDecisionSource } from "./plugin-policy-types.ts";

const MAX_SETTINGS_DEPTH = 8;

export function resolveSettingsPolicy(
  schema: PluginMiniSchema,
  base: Record<string, unknown>,
  global: Record<string, unknown>,
  team: Record<string, unknown>,
  source: Record<string, PolicyDecisionSource>,
  blocked: string[],
  depth = 0,
  path: string[] = []
): Record<string, unknown> {
  if (depth > MAX_SETTINGS_DEPTH || schema.type !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(schema.properties)) {
    const nextPath = [...path, key];
    const childPath = nextPath.join(".");
    const merged = resolveSettingValue(child, base[key], global[key], team[key], blocked, depth + 1, nextPath);
    source[childPath] = merged.source;
    out[key] = merged.value;
    if (merged.blocked) blocked.push(`${childPath}:${merged.blocked}`);
  }
  return out;
}

export function defaultSettings(schema: PluginMiniSchema): Record<string, unknown> {
  return defaultPluginSettings(schema) as Record<string, unknown>;
}

function resolveSettingValue(
  schema: PluginMiniSchema,
  base: unknown,
  globalRaw: unknown,
  teamRaw: unknown,
  blocked: string[],
  depth: number,
  path: string[]
): { value: unknown; source: PolicyDecisionSource; blocked?: string } {
  const strategy = schema.restrictiveMerge ?? defaultStrategy(schema.type);
  const pathId = path.join(".");
  const normalizedBase = normalizePluginSettings(schema, base);
  const global = validateAndNormalize(schema, globalRaw);
  const team = validateAndNormalize(schema, teamRaw);
  const afterGlobal = global.ok ? global.value : normalizedBase;
  if (!global.ok && globalRaw !== undefined) blocked.push(`global_invalid_${pathId}`);
  if (strategy === "inheritOnly" || teamRaw === undefined) return { value: afterGlobal, source: global.ok ? "global" : "blocked" };
  if (!team.ok && teamRaw !== undefined) return { value: afterGlobal, source: "blocked", blocked: "team_invalid" };
  if (!team.ok) return { value: afterGlobal, source: global.ok ? "global" : "blocked" };
  if (schema.type === "object") return objectSetting(schema, normalizedBase, afterGlobal, team.value, blocked, depth, path);
  if (schema.type === "boolean" && strategy === "falseWins") return team.value === false ? { value: false, source: "team" } : { value: afterGlobal, source: "global" };
  if (schema.type === "array" && strategy === "intersection") return intersectSetting(afterGlobal, team.value);
  if (schema.type === "number" || schema.type === "integer") return numericSetting(strategy, afterGlobal, team.value);
  if (schema.type === "enum" && strategy === "orderedMax") return orderedEnumSetting(schema, afterGlobal, team.value);
  return { value: team.value, source: "team" };
}

function objectSetting(schema: PluginMiniSchema, base: unknown, global: unknown, team: unknown, blocked: string[], depth: number, path: string[]) {
  return {
    value: resolveSettingsPolicy(schema, asRecord(base), asRecord(global), asRecord(team), {}, blocked, depth, path),
    source: "team" as const
  };
}

function intersectSetting(global: unknown, team: unknown) {
  const teamArray = Array.isArray(team) ? team : [];
  const globalArray = Array.isArray(global) ? global : [];
  return { value: teamArray.filter((item) => globalArray.includes(item)), source: "team" as const };
}

function numericSetting(strategy: PluginSettingMergeStrategy, global: unknown, team: unknown) {
  const parent = typeof global === "number" ? global : 0;
  const value = typeof team === "number" ? team : parent;
  if (strategy === "minWins") return { value: Math.min(parent, value), source: "team" as const };
  if (strategy === "maxWins" || strategy === "orderedMax") return { value: Math.max(parent, value), source: "team" as const };
  return { value, source: "team" as const };
}

function orderedEnumSetting(schema: PluginMiniEnumSchema, global: unknown, team: unknown) {
  const order = schema.orderedValues ?? schema.values;
  const parentIndex = order.indexOf(String(global));
  const teamIndex = order.indexOf(String(team));
  if (parentIndex === -1 || teamIndex === -1) return { value: global, source: "blocked" as const, blocked: "enum_out_of_order" };
  return { value: order[Math.min(parentIndex, teamIndex)], source: "team" as const };
}

function defaultStrategy(type: PluginMiniSchema["type"]): PluginSettingMergeStrategy {
  if (type === "boolean") return "falseWins";
  if (type === "array") return "intersection";
  if (type === "integer" || type === "number") return "minWins";
  return "inheritOnly";
}

function validateAndNormalize(schema: PluginMiniSchema, value: unknown): { ok: boolean; value: unknown } {
  if (value === undefined) return { ok: false, value };
  return validatePluginSettings(schema, value).ok ? { ok: true, value: normalizePluginSettings(schema, value) } : { ok: false, value };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
