const FORBIDDEN_SCOPES = new Set(["global", "team"]);
const MAX_DEPTH = 8;
const MAX_ARRAY = 100;
const MAX_OBJECT = 100;
const MAX_STRING = 4096;
const SENSITIVE_CANARY = /\b(?:raw[_-]?(?:prompt|response)|full[_-]?(?:prompt|response)|authorization|cookie|mk_[a-z0-9_-]{12,})\b/i;

export type PluginStorageInputResult = { ok: boolean; value: unknown; errors: string[] };

export function safePluginStorageInput(pluginId: string, scope: "global" | "team", value: unknown): PluginStorageInputResult {
  if (!pluginId || !FORBIDDEN_SCOPES.has(scope)) return { ok: false, value: undefined, errors: ["invalid-scope"] };
  const errors: string[] = [];
  const seen = new WeakSet<object>();
  const sanitized = sanitize(value, 0, undefined, pluginId, errors, seen);
  return { ok: errors.length === 0, value: sanitized, errors };
}

function sanitize(value: unknown, depth: number, key: string | undefined, pluginId: string, errors: string[], seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (key && forbiddenKey(key)) errors.push("forbidden-key");
  if (typeof value === "string") return sanitizeString(value, pluginId, errors);
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1, key, pluginId, errors, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source).slice(0, MAX_OBJECT).map(([entryKey, entryValue]) => {
    if (forbiddenKey(entryKey)) {
      errors.push("forbidden-key");
      return [entryKey, `[REDACTED_PLUGIN_STORAGE:${pluginId}]`];
    }
    return [entryKey, sanitize(entryValue, depth + 1, entryKey, pluginId, errors, seen)];
  }));
}
  if (typeof value === "number") return Number.isFinite(value) ? value : "[INVALID_NUMBER]";
  return String(value);
}

function sanitizeString(input: string, pluginId: string, errors: string[]): string {
  if (SENSITIVE_CANARY.test(input)) {
    errors.push("forbidden-storage-content");
    return `[REDACTED_PLUGIN_STORAGE:${pluginId}]`;
  }
  if (input.length > MAX_STRING) return input.slice(0, MAX_STRING);
  return input;
}

function forbiddenKey(key: string): boolean {
  return /(?:^|[_-])(authorization|cookie|raw[_-]?prompt|raw[_-]?response)(?:$|[_-])/i.test(key);
}
