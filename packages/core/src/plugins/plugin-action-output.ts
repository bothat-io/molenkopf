import type { PluginMiniSchema, PluginSchemaIssue } from "./plugin-settings-schema.ts";
import { validatePluginSettings } from "./plugin-settings-schema.ts";

const MAX_OUTPUT_DEPTH = 5;
const MAX_OUTPUT_PROPERTIES = 100;
const MAX_OUTPUT_ARRAY = 100;
const MAX_OUTPUT_STRING = 1000;

export type PluginActionOutputValidationResult = {
  ok: boolean;
  errors: PluginSchemaIssue[];
};

export function validatePluginActionOutput(schema: PluginMiniSchema, value: unknown): PluginActionOutputValidationResult {
  const result = validatePluginSettings(schema, value);
  const errors = [...result.errors];
  scanOutput(value, "", 0, errors, new WeakSet());
  return { ok: errors.length === 0, errors };
}

function scanOutput(value: unknown, path: string, depth: number, errors: PluginSchemaIssue[], seen: WeakSet<object>): void {
  if (depth > MAX_OUTPUT_DEPTH) {
    errors.push({ path, code: "output-too-deep" });
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_OUTPUT_STRING) errors.push({ path, code: "output-string-too-long" });
    if (isSensitiveValue(value)) errors.push({ path, code: "unsafe-output-value" });
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) {
    errors.push({ path, code: "output-circular-reference" });
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_OUTPUT_ARRAY) errors.push({ path, code: "output-array-too-long" });
    for (let i = 0; i < Math.min(value.length, MAX_OUTPUT_ARRAY); i++) {
      scanOutput(value[i], `${path}[${i}]`, depth + 1, errors, seen);
    }
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_OUTPUT_PROPERTIES) errors.push({ path, code: "output-too-many-properties" });
  for (const [key, item] of entries.slice(0, MAX_OUTPUT_PROPERTIES)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isSensitiveKey(key)) errors.push({ path: childPath, code: "unsafe-output-key" });
    scanOutput(item, childPath, depth + 1, errors, seen);
  }
}

function isSensitiveKey(key: string): boolean {
  return /(?:^|[_-])(?:password|passwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key|raw[_-]?(?:prompt|response)|full[_-]?(?:prompt|response))(?:$|[_-])/i.test(key);
}

function isSensitiveValue(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{12,}|mk_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{12,})\b/i.test(value);
}
