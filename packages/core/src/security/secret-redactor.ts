import { shortHash } from "../utils/hash.ts";
import { replaceJsonStrings, scanJsonStringValues, type JsonStringReplacement } from "../pipeline/json-string-spans.ts";

export type Redaction = { kind: string; hash: string };
export type RedactionResult = { text: string; redactions: Redaction[] };

type Rule = { kind: string; pattern: RegExp; value?: (match: RegExpExecArray) => string };

const rules: Rule[] = [
  { kind: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: "authorization_bearer", pattern: /(Authorization:\s*Bearer\s+)([^\s\r\n]+)/gi, value: (m) => m[2] },
  { kind: "authorization_basic", pattern: /(Authorization:\s*Basic\s+)([A-Za-z0-9+/=]+)/gi, value: (m) => m[2] },
  { kind: "cookie", pattern: /(Cookie:\s*)([^\r\n]+)/gi, value: (m) => m[2] },
  { kind: "anthropic_api_key", pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g },
  { kind: "openai_api_key", pattern: /\bsk-(?:proj-|)[A-Za-z0-9_-]{32,}\b/g },
  { kind: "github_token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/g },
  { kind: "gitlab_token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "npm_token", pattern: /\bnpm_[A-Za-z0-9]{32,}\b/g },
  { kind: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { kind: "stripe_secret", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "aws_access_key_id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { kind: "db_url", pattern: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s/@]+:[^@\s]+@[^\s"'<>]+/gi },
  { kind: "basic_auth_url", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@[^\s"'<>]+/gi },
  { kind: "sentry_dsn", pattern: /\bhttps:\/\/[A-Za-z0-9]+@[^/\s"'<>]*sentry\.io\/[0-9A-Za-z_-]+/gi },
  { kind: "account_key", pattern: /\b(AccountKey=)(?!\[REDACTED_SECRET:)([^;\s]+)/gi, value: (m) => m[2] },
  { kind: "sensitive_assignment", pattern: /(?<!REDACTED_SECRET:)\b((?:access[_-]?token|refresh[_-]?token|client[_-]?secret|session[_-]?token|auth[_-]?token|db[_-]?url)\s*[:=]\s*)(?!\[REDACTED_SECRET:)([^\s&"'`,;}\\\]]+)/gi, value: (m) => m[2] },
  { kind: "password", pattern: /\b(password=)(?!\[REDACTED_SECRET:)([^\s&"'`,;}\\\]]+)/gi, value: (m) => m[2] },
  { kind: "token", pattern: /\b(token=)(?!\[REDACTED_SECRET:)([^\s&"'`,;}\\\]]+)/gi, value: (m) => m[2] },
  { kind: "secret", pattern: /\b(secret=)(?!\[REDACTED_SECRET:)([^\s&"'`,;}\\\]]+)/gi, value: (m) => m[2] },
  { kind: "api_key", pattern: /\b(api_key=)(?!\[REDACTED_SECRET:)([^\s&"'`,;}\\\]]+)/gi, value: (m) => m[2] },
  { kind: "env_secret", pattern: /(^|[\s{[,;])((?!REDACTED_SECRET\b)[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|PWD|TOKEN|SECRET|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*\s*[:=]\s*)(?!\[REDACTED_SECRET:)([^\s&"'`,;}\\\]]+)/g, value: (m) => m[3] }
];
const sensitiveJsonKeys = /(?:^|[_-])(?:password|passwd|pwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key)(?:$|[_-])/i;

export function redactSecrets(input: string): RedactionResult {
  const redactions: Redaction[] = [];
  let text = redactJsonKeys(input, redactions) ?? input;
  for (const rule of rules) {
    text = text.replace(rule.pattern, (...args) => {
      const match = args[args.length - 3] as string;
      const exec = args.slice(0, -2) as unknown as RegExpExecArray;
      const secret = rule.value ? rule.value(exec) : match;
      const marker = redactionMarker(rule.kind, secret, redactions);
      if (rule.kind === "env_secret") return `${exec[1]}${exec[2]}${marker}`;
      if (rule.value && exec[1]) return `${exec[1]}${marker}`;
      return marker;
    });
  }
  return { text, redactions };
}

function redactJsonKeys(input: string, redactions: Redaction[]): string | undefined {
  if (!/^\s*[\[{]/.test(input)) return undefined;
  if (exceedsSafeJsonDepth(input)) return containsSensitiveJsonKey(input) ? redactionMarker("json_too_deep", input, redactions) : undefined;
  const structural = redactSensitiveJsonValues(input, redactions);
  if (structural) return structural;
  const spans = scanJsonStringValues(input);
  if (!spans) return undefined;
  const replacements: JsonStringReplacement[] = [];
  for (const span of spans) {
    if (span.key && isSensitiveJsonKey(span.key)) {
      if (isRedactionMarker(span.value)) continue;
      replacements.push({ start: span.start, end: span.end, value: redactionMarker(`json_${safeKind(span.key)}`, span.value, redactions) });
      continue;
    }
    const nested = redactJsonKeys(span.value, redactions);
    if (nested && nested !== span.value) replacements.push({ start: span.start, end: span.end, value: nested });
  }
  return replacements.length ? replaceJsonStrings(input, replacements) : undefined;
}

function redactSensitiveJsonValues(input: string, redactions: Redaction[]): string | undefined {
  let root: unknown;
  try { root = JSON.parse(input) as unknown; } catch { return undefined; }
  const stack: Array<{ value: unknown; key?: string; parent?: Record<string, unknown> | unknown[]; index?: string | number }> = [{ value: root }];
  let changed = false;
  while (stack.length) {
    const item = stack.pop()!;
    if (item.key && isSensitiveJsonKey(item.key) && typeof item.value !== "string") {
      const marker = redactionMarker(`json_${safeKind(item.key)}`, JSON.stringify(item.value), redactions);
      if (Array.isArray(item.parent) && typeof item.index === "number") item.parent[item.index] = marker;
      else if (item.parent && typeof item.index === "string") item.parent[item.index] = marker;
      changed = true;
      continue;
    }
    if (!item.value || typeof item.value !== "object") continue;
    if (Array.isArray(item.value)) {
      for (let i = 0; i < item.value.length; i++) stack.push({ value: item.value[i], parent: item.value, index: i });
    } else {
      const object = item.value as Record<string, unknown>;
      for (const [key, value] of Object.entries(object)) stack.push({ value, key, parent: object, index: key });
    }
  }
  return changed ? JSON.stringify(root) : undefined;
}

function redactionMarker(kind: string, secret: string, redactions: Redaction[]): string {
  const hash = shortHash(secret);
  redactions.push({ kind, hash });
  return `[REDACTED_SECRET:${kind}:sha256:${hash}]`;
}

function safeKind(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function isSensitiveJsonKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return sensitiveJsonKeys.test(normalized);
}

function containsSensitiveJsonKey(input: string): boolean {
  return /"(?:[^"\\]|\\.)*(?:password|passwd|pwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key)(?:[^"\\]|\\.)*"\s*:/i.test(input);
}

function isRedactionMarker(value: string): boolean {
  return /^\[REDACTED_SECRET:[a-z0-9_-]+:sha256:[a-f0-9]{12}\]$/.test(value);
}

function exceedsSafeJsonDepth(text: string): boolean {
  let depth = 0, inString = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' && !escaped(text, i)) inString = !inString;
    if (inString) continue;
    if (text[i] === "{" || text[i] === "[") depth++;
    else if (text[i] === "}" || text[i] === "]") depth--;
    if (depth > 1000) return true;
  }
  return false;
}

function escaped(text: string, quoteIndex: number): boolean {
  let slashes = 0;
  for (let i = quoteIndex - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}
