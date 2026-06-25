import type { ProviderConfig } from "../providers/provider-catalog.ts";
import { normalizeProvider } from "./provider-config.ts";
import { validateProviderTarget } from "../security/target-policy.ts";
import { normalizePolicyConfig, type PluginPolicy, type ProfilePolicy, type ResolvedAgent } from "./config-policies.ts";

export type NormalizedMolenkopfConfig = {
  target: string;
  server: { bindHost?: string; port?: number; allowPublicBind?: boolean; dataDir?: string };
  providers: ProviderConfig[];
  activeProviderId: string;
  profiles: ProfilePolicy[];
  pluginPolicies: PluginPolicy[];
  agents: ResolvedAgent[];
};

type JsonRecord = Record<string, unknown>;

const FORBIDDEN_KEYS = new Set(["apikey", "token", "secret", "authorization", "cookie", "password"]);
const ALLOWED_SECRET_KEYS = new Set(["credentialref"]);

export function parseMolenkopfConfigJson(text: string, source = "molenkopf.config.json"): NormalizedMolenkopfConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`invalid Molenkopf config JSON: ${source}`);
  }
  return normalizeMolenkopfConfig(parsed);
}

export function normalizeMolenkopfConfig(input: unknown): NormalizedMolenkopfConfig {
  assertNoForbiddenKeys(input);
  const root = record(input, "$");
  const schemaVersion = root.schemaVersion ?? root.version;
  if (schemaVersion !== 1) throw new Error("molenkopf config schemaVersion must be 1");
  const providers = array(root.providers, "$.providers").map(normalizeProvider);
  if (!providers.length) throw new Error("molenkopf config requires providers");
  assertUnique(providers.map((item) => item.id), "provider");
  const providerIds = new Set(providers.map((item) => item.id));
  const enabledProviderIds = new Set(providers.filter((item) => item.enabled !== false).map((item) => item.id));
  const policies = normalizePolicyConfig(root, providerIds, enabledProviderIds);
  const server = normalizeServer(root.server);
  const target = stringOrUndefined(root.target) ?? providers[0].target;
  validateTarget(target, "$.target", providers);
  const activeProviderId = policies.firstProvider ?? providers.find((item) => item.enabled !== false)?.id ?? providers[0].id;
  if (!providerIds.has(activeProviderId)) throw new Error(`unknown active provider: ${activeProviderId}`);
  if (providers.find((item) => item.id === activeProviderId)?.enabled === false) throw new Error(`active provider disabled: ${activeProviderId}`);
  return { target, server, providers, activeProviderId, profiles: policies.profiles, pluginPolicies: policies.pluginPolicies, agents: policies.agents };
}

function normalizeServer(input: unknown): NormalizedMolenkopfConfig["server"] {
  if (input === undefined) return {};
  const item = record(input, "$.server");
  const out: NormalizedMolenkopfConfig["server"] = {};
  if (item.bindHost !== undefined) out.bindHost = string(item.bindHost, "$.server.bindHost");
  if (item.host !== undefined) out.bindHost = string(item.host, "$.server.host");
  if (item.port !== undefined) out.port = port(item.port);
  if (item.allowPublicBind !== undefined) out.allowPublicBind = boolean(item.allowPublicBind, "$.server.allowPublicBind");
  if (item.dataDir !== undefined) out.dataDir = string(item.dataDir, "$.server.dataDir");
  return out;
}

function assertNoForbiddenKeys(value: unknown, path = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
  Object.entries(value as JsonRecord).forEach(([key, child]) => {
    const normalized = key.toLowerCase().replace(/[-_]/g, "");
    if (FORBIDDEN_KEYS.has(normalized) && !ALLOWED_SECRET_KEYS.has(normalized)) throw new Error(`forbidden secret field in config: ${path}.${key}`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  });
}

function validateTarget(value: string, path: string, providers: ProviderConfig[]) {
  const url = new URL(value);
  if (url.protocol === "cli:") return;
  validateProviderTarget(value, { path, allowPrivate: providers.some((item) => item.kind === "local" && item.target === value) });
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) throw new Error(`duplicate ${label} id: ${value}`);
    seen.add(value);
  });
}

function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`expected object: ${path}`);
  return value as JsonRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`expected array: ${path}`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`expected string: ${path}`);
  return value.trim();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`expected boolean: ${path}`);
  return value;
}

function port(value: unknown): number {
  const portNumber = Number(value);
  if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) throw new Error("invalid server port");
  return portNumber;
}
