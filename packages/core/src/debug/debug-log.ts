import { redactSecrets } from "../security/secret-redactor.ts";

export type DebugScope = "sse" | "cli" | "pipeline" | "plugins" | "usage";

const SCOPES = new Set<DebugScope>(["sse", "cli", "pipeline", "plugins", "usage"]);
const SENSITIVE = /(?:^|[_-])(?:password|passwd|pwd|token|authorization|auth|cookie|secret|api[_-]?key|credential|private[_-]?key)(?:$|[_-])/i;

export function debugEnabled(scope: DebugScope, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.MOLENKOPF_DEBUG;
  if (!value) return false;
  const scopes = value.split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return scopes.includes("*") || scopes.includes("all") || scopes.includes(scope);
}

export function debugLog(scope: DebugScope, event: string, fields: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = process.env, write = process.stderr.write.bind(process.stderr)): void {
  if (!debugEnabled(scope, env)) return;
  write(`${formatDebugLine(scope, event, fields)}\n`);
}

export function formatDebugLine(scope: DebugScope, event: string, fields: Record<string, unknown> = {}): string {
  const parts = Object.entries(fields).flatMap(([key, value]) => {
    const safeKey = safeToken(key);
    const safeValue = safeField(key, value);
    return safeKey && safeValue !== undefined ? [`${safeKey}=${safeValue}`] : [];
  });
  return [`[molenkopf:${SCOPES.has(scope) ? scope : "pipeline"}]`, safeToken(event) || "event", ...parts].join(" ");
}

function safeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 64);
}

function safeField(key: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (SENSITIVE.test(key)) return JSON.stringify("[redacted]");
  if (typeof value === "number") return Number.isFinite(value) ? String(Math.trunc(value)) : "0";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(redactSecrets(value).text.replace(/\s+/g, " ").trim().slice(0, 160));
  if (value === null) return "null";
  if (Array.isArray(value)) return JSON.stringify(`[array:${Math.min(value.length, 50)}]`);
  return JSON.stringify("[object]");
}
