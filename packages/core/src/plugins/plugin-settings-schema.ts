export type PluginSettingMergeStrategy = "falseWins" | "minWins" | "maxWins" | "orderedMax" | "intersection" | "inheritOnly";

const MAX_DEPTH = 4;
const MAX_PROPERTIES = 50;
const MAX_ARRAY_LENGTH = 100;
const MAX_STRING_LENGTH = 500;

export type PluginBaseSchema = {
  default?: unknown;
  sensitive?: boolean;
  restrictiveMerge?: PluginSettingMergeStrategy;
};
export type PluginMiniBooleanSchema = PluginBaseSchema & { type: "boolean"; default?: boolean };
export type PluginMiniStringSchema = PluginBaseSchema & { type: "string"; minLength?: number; maxLength?: number; default?: string };
export type PluginMiniIntegerSchema = PluginBaseSchema & { type: "integer"; minimum?: number; maximum?: number; default?: number };
export type PluginMiniNumberSchema = PluginBaseSchema & { type: "number"; minimum?: number; maximum?: number; default?: number };
export type PluginMiniEnumSchema = PluginBaseSchema & { type: "enum"; values: readonly string[]; orderedValues?: readonly string[]; default?: string };
export type PluginMiniArraySchema = PluginBaseSchema & { type: "array"; items: PluginMiniSchema; minLength?: number; maxLength?: number; default?: readonly unknown[] };
export type PluginMiniObjectSchema = PluginBaseSchema & {
  type: "object";
  properties: Record<string, PluginMiniSchema>;
  required?: readonly string[];
  maxProperties?: number;
  additionalProperties?: boolean;
  default?: Record<string, unknown>;
};
// additionalProperties is explicit and defaults to false when omitted.
// unknown keys are rejected unless explicitly enabled.


export type PluginMiniSchema = PluginMiniBooleanSchema | PluginMiniStringSchema | PluginMiniIntegerSchema | PluginMiniNumberSchema | PluginMiniEnumSchema | PluginMiniArraySchema | PluginMiniObjectSchema;

export type PluginSchemaIssue = { path: string; code: string };
export type PluginSchemaValidationResult = { ok: boolean; errors: PluginSchemaIssue[] };

export function validatePluginSettings(schema: PluginMiniSchema, value: unknown): PluginSchemaValidationResult {
  const errors: PluginSchemaIssue[] = [];
  if (schemaDepth(schema, 0) > MAX_DEPTH) errors.push({ path: "", code: "schema-depth-exceeded" });
  validateNode(schema, value, "", 0, errors, new WeakSet());
  return { ok: errors.length === 0, errors };
}

export function normalizePluginSettings(schema: PluginMiniSchema, value: unknown): unknown {
  return normalizeNode(schema, value, 0, new WeakSet());
}

export function defaultPluginSettings(schema: PluginMiniSchema): unknown {
  return normalizeNode(schema, undefined, 0, new WeakSet());
}

export function redactPluginSettingsForView(schema: PluginMiniSchema, value: unknown, role: "admin" | "member" = "member"): unknown {
  return redactNode(schema, value, role, new WeakSet());
}

function validateNode(schema: PluginMiniSchema, value: unknown, path: string, depth: number, errors: PluginSchemaIssue[], seen: WeakSet<object>): void {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return void errors.push({ path, code: "expected-object" });
    if (seen.has(value)) return void errors.push({ path, code: "circular-reference" });
    seen.add(value);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const maxProperties = schema.maxProperties ?? MAX_PROPERTIES;
    if (keys.length > maxProperties) errors.push({ path, code: "too-many-properties" });
    const allowUnknown = schema.additionalProperties === true;
    for (const key of keys) {
      const child = schema.properties[key];
      if (!child && !allowUnknown) errors.push({ path: joinPath(path, key), code: "unknown-property" });
      if (child) validateNode(child, obj[key], joinPath(path, key), depth + 1, errors, seen);
    }
    for (const required of schema.required ?? []) if (!(required in obj)) errors.push({ path: joinPath(path, required), code: "missing-required" });
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) return void errors.push({ path, code: "expected-array" });
    const max = schema.maxLength ?? MAX_ARRAY_LENGTH;
    const min = schema.minLength ?? 0;
    if (value.length < min) errors.push({ path, code: "array-too-short" });
    if (value.length > max) errors.push({ path, code: "array-too-long" });
    for (let i = 0; i < Math.min(value.length, max); i++) validateNode(schema.items, value[i], `${path}[${i}]`, depth + 1, errors, seen);
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return void errors.push({ path, code: "expected-string" });
    if (value.length < (schema.minLength ?? 0)) return void errors.push({ path, code: "string-too-short" });
    if (value.length > (schema.maxLength ?? MAX_STRING_LENGTH)) return void errors.push({ path, code: "string-too-long" });
    return;
  }
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return void errors.push({ path, code: "expected-finite-number" });
    if (schema.type === "integer" && !Number.isInteger(value)) return void errors.push({ path, code: "expected-integer" });
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, code: "number-too-small" });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, code: "number-too-large" });
    return;
  }
  if (schema.type === "enum") {
    if (typeof value !== "string") return void errors.push({ path, code: "expected-string" });
    if (!schema.values.includes(value)) errors.push({ path, code: "invalid-enum-value" });
    return;
  }
  if (typeof value !== "boolean") errors.push({ path, code: "expected-boolean" });
}

function normalizeNode(schema: PluginMiniSchema, value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (schema.type === "boolean") return typeof value === "boolean" ? value : schema.default ?? false;
  if (schema.type === "string") return typeof value === "string" ? value.slice(0, schema.maxLength ?? MAX_STRING_LENGTH) : schema.default ?? "";
  if (schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return schema.default ?? 0;
    return schema.minimum === undefined ? Math.trunc(value) : clamp(Math.trunc(value), schema.minimum, schema.maximum ?? Number.MAX_SAFE_INTEGER);
  }
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return schema.default ?? 0;
    return clamp(value, schema.minimum ?? -Number.MAX_SAFE_INTEGER, schema.maximum ?? Number.MAX_SAFE_INTEGER);
  }
  if (schema.type === "enum") return typeof value === "string" && schema.values.includes(value) ? value : schema.default ?? schema.values[0] ?? "";
	  if (schema.type === "array") {
	    const arraySchema = schema;
	    const source = Array.isArray(value) ? value : Array.isArray(arraySchema.default) ? [...arraySchema.default] : [];
	    const max = arraySchema.maxLength ?? MAX_ARRAY_LENGTH;
    const items = arraySchema.items as PluginMiniSchema;
    return source.slice(0, max).map((item) => normalizeNode(items, item, depth + 1, seen));
  }
  if (schema.type !== "object") return {};
  const obj = (!value || typeof value !== "object" || Array.isArray(value)) ? {} : value as Record<string, unknown>;
  if (seen.has(obj)) return "[CIRCULAR]";
  seen.add(obj);
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(schema.properties)) normalized[key] = normalizeNode(child, obj[key], depth + 1, seen);
  return normalized;
}

function redactNode(schema: PluginMiniSchema, value: unknown, role: "admin" | "member", seen: WeakSet<object>): unknown {
  if (!value || role === "admin" || typeof value !== "object") return value;
  if (schema.type === "object") {
    if (Array.isArray(value)) return "[REDACTED_ARRAY]";
    if (seen.has(value)) return "[REDACTED]";
    seen.add(value);
    const obj = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!(key in obj)) continue;
      output[key] = isSensitiveKey(key) || isSensitiveValue(obj[key]) || Boolean(child.sensitive) ? "[REDACTED]" : redactNode(child, obj[key], role, seen);
    }
    return output;
  }
  if (schema.type === "array") return Array.isArray(value) ? value.map((item) => redactNode(schema.items, item, role, seen)) : value;
  return isSensitiveValue(value) ? "[REDACTED]" : value;
}

function schemaDepth(schema: PluginMiniSchema, depth: number): number {
  if (schema.type !== "object" && schema.type !== "array") return depth;
  if (schema.type === "array") return schemaDepth(schema.items, depth + 1);
  return Object.values(schema.properties).reduce((max, child) => Math.max(max, schemaDepth(child, depth + 1)), depth);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function isSensitiveKey(key: string): boolean {
  return /(?:^|[_-])(?:password|passwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key)(?:$|[_-])/i.test(key);
}

function isSensitiveValue(value: unknown): boolean {
  return typeof value === "string" && /mk_[A-Za-z0-9_-]{16,}/.test(value);
}

function joinPath(base: string, key: string): string { return base ? `${base}.${key}` : key; }
