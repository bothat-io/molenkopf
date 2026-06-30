import { DEFAULT_CLI_PROVIDER_TIMEOUT_MS, type ProviderConfig } from "../providers/provider-catalog.ts";
import { inferredCredentialAuthScheme, isAnthropicStyleProvider } from "../providers/provider-auth.ts";
import { validateProviderTarget } from "../security/target-policy.ts";

type JsonRecord = Record<string, unknown>;

const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
const ENV_REF_RE = /^env:([A-Z_][A-Z0-9_]*)$/i;
const SECRET_REF_RE = /^secret:[a-z0-9][a-z0-9._:-]{0,63}$/i;

export function normalizeProvider(input: unknown, index: number): ProviderConfig {
  const item = record(input, `$.providers[${index}]`);
  if (item.credentialEnv !== undefined) throw new Error("use auth.credentialRef instead of credentialEnv in JSON config");
  const id = idValue(item.id, `$.providers[${index}].id`);
  const runtime = runtimeKind(item.kind);
  if (runtime) return cliProvider(item, id, runtime);
  return apiProvider(item, index, id);
}

function apiProvider(item: JsonRecord, index: number, id: string): ProviderConfig {
  const kind = providerKind(item.kind);
  if (item.credentialRef !== undefined) throw new Error("use auth.credentialRef instead of top-level credentialRef in JSON config");
  if (item.authScheme !== undefined) throw new Error("use auth.scheme instead of top-level authScheme in JSON config");
  const target = stringOrUndefined(item.baseUrl) ?? stringOrUndefined(item.target) ?? defaultTarget(item.kind);
  if (!target) throw new Error(`missing provider baseUrl: ${id}`);
  validateProviderTarget(target, { path: `$.providers[${index}].baseUrl`, allowPrivate: kind === "local" });
  const auth = item.auth === undefined ? {} : record(item.auth, `$.providers[${index}].auth`);
  if (auth.credential !== undefined) throw new Error("inline credentials are not allowed in file config; use auth.credentialRef");
  const credentialValue = undefined;
  const credentialRef = stringOrUndefined(auth.credentialRef) ?? "none";
  const credentialEnv = credentialEnvFromRef(credentialRef, id);
  const protocol = protocolValue(item.protocol, item.kind, kind, target, `$.providers[${index}].protocol`);
  return {
    id,
    name: stringOrUndefined(item.name) ?? id,
    kind,
    target,
    credentialEnv,
    credentialRef,
    credentialValue,
    authScheme: authSchemeValue(auth.scheme, { protocol, kind: item.kind, target }, credentialEnv || credentialValue, `$.providers[${index}].auth.scheme`),
    protocol,
    enabled: item.enabled === undefined ? true : boolean(item.enabled, `$.providers[${index}].enabled`)
  };
}

function cliProvider(item: JsonRecord, id: string, runtime: "claude" | "codex"): ProviderConfig {
  const inputMode = cliInputMode(item.inputMode, id);
  if (inputMode === "argument" && item.allowUnsafeArgumentInput !== true) throw new Error(`unsafe CLI inputMode for provider: ${id}`);
  return {
    id,
    name: stringOrUndefined(item.name) ?? id,
    kind: "cli",
    target: `cli://${id}`,
    runtime,
    cliCommand: stringOrUndefined(item.command) ?? runtime,
    cliArgs: stringArray(item.args ?? (runtime === "codex" ? ["exec"] : ["--print"]), `$.providers.${id}.args`),
    cliInputMode: inputMode,
    cliTimeoutMs: positiveNumber(item.timeoutMs, DEFAULT_CLI_PROVIDER_TIMEOUT_MS),
    authScheme: "none",
    credentialRef: "none",
    enabled: item.enabled === undefined ? true : boolean(item.enabled, `$.providers.${id}.enabled`)
  };
}

function runtimeKind(value: unknown): ProviderConfig["runtime"] | undefined {
  if (value === "cli-claude") return "claude";
  if (value === "cli-codex") return "codex";
  return undefined;
}

function credentialEnvFromRef(ref: string, id: string): string | undefined {
  if (ref === "none") return undefined;
  if (ref === "json:inline") throw new Error(`inline credentials are not allowed for provider: ${id}`);
  if (SECRET_REF_RE.test(ref)) throw new Error(`unsupported credentialRef for provider: ${id}`);
  const match = ref.match(ENV_REF_RE);
  if (!match) throw new Error(`invalid credentialRef for provider: ${id}`);
  return match[1];
}

function authSchemeValue(value: unknown, provider: { protocol?: ProviderConfig["protocol"]; kind?: unknown; target?: string }, credential: string | undefined, path: string): ProviderConfig["authScheme"] {
  if (value === "bearer" || value === "x-api-key" || value === "none") return value;
  if (value !== undefined) throw new Error(`invalid provider auth.scheme: ${path}`);
  return inferredCredentialAuthScheme(credential, provider);
}

function providerKind(value: unknown): ProviderConfig["kind"] {
  if (value === undefined || value === "api" || value === "openai-compatible" || value === "anthropic") return "api";
  if (value === "local" || value === "local-openai" || value === "ollama") return "local";
  throw new Error("invalid provider kind");
}

function defaultTarget(value: unknown): string | undefined {
  return value === "ollama" ? "http://127.0.0.1:11434/v1" : undefined;
}

function protocolValue(value: unknown, rawKind: unknown, kind: ProviderConfig["kind"], target: string, path: string): ProviderConfig["protocol"] {
  if (value === "openai-responses" || value === "anthropic-messages" || value === "openai-chat" || value === "ollama-tags") return value;
  if (value !== undefined) throw new Error(`invalid provider protocol: ${path}`);
  if (rawKind === "ollama" || target.includes("11434")) return "ollama-tags";
  if (kind === "local") return "openai-chat";
  return isAnthropicStyleProvider({ kind: rawKind, target }) ? "anthropic-messages" : "openai-responses";
}

function cliInputMode(value: unknown, id: string): ProviderConfig["cliInputMode"] {
  if (value === undefined || value === "stdin") return "stdin";
  if (value === "argument") return "argument";
  throw new Error(`invalid CLI inputMode for provider: ${id}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`expected object: ${path}`);
  return value as JsonRecord;
}

function idValue(value: unknown, path: string): string {
  const id = string(value, path);
  if (!ID_RE.test(id)) throw new Error(`invalid id: ${path}`);
  if (id.toLowerCase() === "default") throw new Error(`reserved provider id: ${path}`);
  return id;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`expected string: ${path}`);
  return value.trim();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`expected string array: ${path}`);
  return value as string[];
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`expected boolean: ${path}`);
  return value;
}

function positiveNumber(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) throw new Error("invalid cli timeout");
  return numberValue;
}
