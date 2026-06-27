import type { PluginJson } from "../../../core/src/plugins/plugin-api.ts";
import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";

const MAX_DEPTH = 8;
const MAX_ARRAY = 100;
const MAX_OBJECT = 100;
const MAX_STRING = 4096;
const SENSITIVE_CANARY = /\b(?:raw\s*(?:prompt|response)|full[_-]?(?:prompt|response)|request[_-]?body|response[_-]?body|prompt[_-]?(?:snippet)?|credentials?)\b/i;
const REDACTED = "[REDACTED_PLUGIN_OUTPUT]";

export type SafePluginOutputScope = "strict" | "adminSafe";

export function safePluginOutput(pluginId: string, value: unknown, scope: SafePluginOutputScope = "strict"): PluginJson {
  const seen = new WeakSet<object>();
  const sanitized = sanitize(value, 0, undefined, scope, seen);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) return sanitized as PluginJson;
  return { pluginId, value: sanitized };
}

function sanitize(value: unknown, depth: number, key: string | undefined, scope: SafePluginOutputScope = "strict", seen: WeakSet<object>): unknown {
  if (key && unsafeKey(key)) return REDACTED;
  if (scope === "strict") {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return safeString(value);
    if (typeof value === "number") return Number.isFinite(value) ? value : "[INVALID_NUMBER]";
    if (typeof value === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if (!value || typeof value !== "object") return undefined;
  } else {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return safeString(value);
    if (typeof value === "number") return Number.isFinite(value) ? value : "[INVALID_NUMBER]";
    if (typeof value === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if (!value || typeof value !== "object") return undefined;
  }

  if (typeof value === "string") return safeString(value);

  if (typeof value !== "object" || value === null) return "[UNSUPPORTED_PLUGIN_OUTPUT_TYPE]";
  if (typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR_REFERENCE]";
    seen.add(value);
  }
  if (depth >= MAX_DEPTH) return "[TRUNCATED_PLUGIN_OUTPUT]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1, undefined, scope, seen));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT).map(([itemKey, item]) => [
    safeKey(itemKey),
    sanitize(item, depth + 1, itemKey, scope, seen)
  ]));
}

function safeString(value: string): string {
  if (SENSITIVE_CANARY.test(value)) return REDACTED;
  const normalized = redactSecrets(value).text;
  if (isBase64Like(normalized)) return REDACTED;
  return normalized.slice(0, MAX_STRING);
}

function safeKey(value: string): string {
  return value.replace(/[^\w .:-]/g, "").slice(0, 80) || "field";
}

function unsafeKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return /(?:^|[_-])(?:password|passwd|pwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key)(?:$|[_-])/i.test(normalized) ||
    /^(?:prompt|raw_prompt|raw_response|request_body|response_body|full_prompt|full_response|messages|credentials?)$/i.test(normalized);
}

function isBase64Like(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 128) return false;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) return false;
  if (!/[+/=]/.test(trimmed)) return false;
  return true;
}
