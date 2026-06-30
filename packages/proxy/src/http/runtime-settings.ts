import { existsSync, readFileSync, renameSync } from "node:fs";
import { rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { inferredCredentialAuthScheme } from "../../../core/src/providers/provider-auth.ts";
import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";
import { defaultDataDir } from "../../../core/src/storage/local-paths.ts";
import { ensurePrivateDir, writePrivateFile } from "../../../core/src/storage/private-state.ts";
import { isLocalProviderCredentialRef } from "./provider-credential-store.ts";
import { type AgentDraftMetadata, type RoutingMode, type RuntimeState } from "./runtime-types.ts";
import { cleanDrafts, persistedDraft } from "./runtime-settings-drafts.ts";
export type RuntimeSettings = {
  activeProviderId?: string;
  routingMode?: RoutingMode;
  pluginEnabled?: Record<string, boolean>;
  pluginPolicy?: unknown;
  pluginOrder?: string[];
  providerWeights?: Record<string, number>;
  providers?: PersistedProvider[];
  consumerBudgets?: Record<string, number>;
  agentDrafts?: AgentDraftMetadata[];
};
export type RuntimeSettingsLoad = { settings: RuntimeSettings; warning?: string };
type PersistedProvider = Pick<ProviderConfig, "id" | "name" | "kind" | "target" | "credentialEnv" | "credentialRef" | "authScheme" | "protocol" | "enabled" | "allowDistribution" | "runtime" | "cliCommand" | "cliArgs" | "cliInputMode" | "cliTimeoutMs">;
const BUILT_IN_IDS = new Set(["default", "openai-env", "anthropic-env", "ollama-local", "lmstudio-local"]);
const FILE = "runtime-settings.json";
export function loadRuntimeSettings(dataDir: string | undefined): RuntimeSettingsLoad {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return { settings: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const settings = cleanSettings(parsed);
    return { settings, warning: cleanWarning(parsed, settings) };
  } catch {
    const corrupt = `${file}.corrupt.${Date.now()}`;
    try { renameSync(file, corrupt); } catch { /* best effort */ }
    return { settings: {}, warning: `runtime settings were corrupt and quarantined as ${corrupt}` };
  }
}

export async function persistRuntimeSettings(state: RuntimeState): Promise<void> {
  const file = settingsFile(state.dataDir);
  await ensurePrivateDir(dirname(file));
  const data: RuntimeSettings = {
    activeProviderId: state.activeProviderId,
    routingMode: state.routingMode,
    pluginPolicy: state.pluginPolicyState,
    pluginEnabled: state.pluginEnabled,
    pluginOrder: state.pluginOrder,
    providerWeights: state.providerWeights,
    providers: state.providers.filter(persistableProvider).map(persistedProvider),
    consumerBudgets: state.consumerBudgets,
    agentDrafts: state.agentDrafts.map(persistedDraft)
  };
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writePrivateFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

function settingsFile(dataDir: string | undefined): string { return join(dataDir ?? defaultDataDir(), FILE); }

function persistableProvider(provider: ProviderConfig): boolean {
  return !BUILT_IN_IDS.has(provider.id) && !provider.runtimeAuthDir && (!provider.credentialValue || isLocalProviderCredentialRef(provider.credentialRef, provider.id));
}

function persistedProvider(provider: ProviderConfig): PersistedProvider {
  const { id, name, kind, target, credentialEnv, credentialRef, authScheme, protocol, enabled, allowDistribution, runtime, cliCommand, cliArgs, cliInputMode, cliTimeoutMs } = provider;
  return { id, name, kind, target, credentialEnv, credentialRef, authScheme, protocol, enabled, allowDistribution, runtime, cliCommand, cliArgs, cliInputMode, cliTimeoutMs };
}

function cleanSettings(value: unknown): RuntimeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as RuntimeSettings;
  return {
    activeProviderId: idOk(input.activeProviderId) ? input.activeProviderId : undefined,
    routingMode: input.routingMode === "manual" || input.routingMode === "distribute" ? input.routingMode : undefined,
    pluginPolicy: typeof input.pluginPolicy === "object" && input.pluginPolicy !== null ? input.pluginPolicy : undefined,
    pluginEnabled: cleanBooleanMap(input.pluginEnabled),
    pluginOrder: cleanIdArray(input.pluginOrder),
    providerWeights: cleanWeights(input.providerWeights),
    providers: cleanProviders(input.providers),
    consumerBudgets: cleanBudgets(input.consumerBudgets),
    agentDrafts: cleanDrafts(input.agentDrafts)
  };
}

function cleanWarning(value: unknown, settings: RuntimeSettings): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const providers = (value as RuntimeSettings).providers;
  return Array.isArray(providers) && providers.length !== (settings.providers?.length ?? 0) ? "runtime settings contained invalid provider records that were ignored" : undefined;
}

function cleanBudgets(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [id, limit] of Object.entries(value)) {
    if (/^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(id) && typeof limit === "number" && Number.isInteger(limit) && limit > 0) out[id] = limit;
  }
  return out;
}

function cleanProviders(value: unknown): PersistedProvider[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>(), out: PersistedProvider[] = [];
  for (const item of value) {
    const provider = cleanProvider(item);
    if (provider && !seen.has(provider.id)) { seen.add(provider.id); out.push(provider); }
  }
  return out.length ? out : undefined;
}

function cleanProvider(value: unknown): PersistedProvider | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "string" && idOk(item.id) && !BUILT_IN_IDS.has(item.id) ? item.id : "";
  const kind = item.kind === "api" || item.kind === "local" || item.kind === "cli" ? item.kind : undefined;
  const target = typeof item.target === "string" ? item.target : "";
  if (!id || !kind || item.credentialValue !== undefined || item.credential !== undefined) return undefined;
  if (kind === "cli") return cleanCliProvider(id, item);
  try { validateProviderTarget(target, { path: "runtime provider target", allowPrivate: kind === "local" }); } catch { return undefined; }
  const localCredentialRef = isLocalProviderCredentialRef(item.credentialRef, id) ? item.credentialRef : undefined;
  const credentialEnv = localCredentialRef ? undefined : cleanEnv(item.credentialEnv);
  const credentialRef = localCredentialRef ?? (credentialEnv ? `env:${credentialEnv}` : "none");
  const protocol = cleanProtocol(item.protocol);
  return cleanBaseProvider(id, item, kind, target, { credentialEnv, credentialRef, authScheme: cleanAuth(item.authScheme, target, Boolean(credentialEnv || localCredentialRef), protocol), protocol });
}

function cleanCliProvider(id: string, item: Record<string, unknown>): PersistedProvider | undefined {
  const runtime = item.runtime === "claude" || item.runtime === "codex" ? item.runtime : undefined;
  const target = typeof item.target === "string" && item.target === `cli://${id}` ? item.target : "";
  if (!runtime || !target) return undefined;
  const cliArgs = Array.isArray(item.cliArgs) && item.cliArgs.every((arg) => typeof arg === "string") ? item.cliArgs.slice(0, 20) as string[] : undefined;
  const cliTimeoutMs = typeof item.cliTimeoutMs === "number" && Number.isInteger(item.cliTimeoutMs) && item.cliTimeoutMs > 0 && item.cliTimeoutMs <= 600000 ? item.cliTimeoutMs : undefined;
  return cleanBaseProvider(id, item, "cli", target, {
    runtime,
    cliCommand: typeof item.cliCommand === "string" && item.cliCommand.trim() ? item.cliCommand.trim().slice(0, 80) : runtime,
    cliArgs,
    cliInputMode: item.cliInputMode === "argument" ? "argument" : "stdin",
    cliTimeoutMs,
    authScheme: "none",
    credentialRef: "none"
  });
}

function cleanBaseProvider(id: string, item: Record<string, unknown>, kind: ProviderConfig["kind"], target: string, extra: Partial<PersistedProvider>): PersistedProvider {
  return { id, name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 80) : id, kind, target, enabled: item.enabled !== false, allowDistribution: typeof item.allowDistribution === "boolean" ? item.allowDistribution : undefined, ...extra };
}

function cleanBooleanMap(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [id, enabled] of Object.entries(value)) if (idOk(id) && typeof enabled === "boolean") out[id] = enabled;
  return Object.keys(out).length ? out : undefined;
}

function cleanWeights(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [id, weight] of Object.entries(value)) if (idOk(id) && typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= 1000) out[id] = weight;
  return Object.keys(out).length ? out : undefined;
}

function cleanIdArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((id): id is string => idOk(id)).slice(0, 100);
  return out.length ? [...new Set(out)] : undefined;
}

function cleanEnv(value: unknown): string | undefined { return typeof value === "string" && /^[A-Z_][A-Z0-9_]*$/i.test(value) ? value : undefined; }

function cleanAuth(value: unknown, target: string, credentialConfigured?: boolean, protocol?: ProviderConfig["protocol"]): ProviderConfig["authScheme"] {
  if (value === "bearer" || value === "x-api-key" || value === "none") return value;
  return inferredCredentialAuthScheme(credentialConfigured, { protocol, target });
}

function cleanProtocol(value: unknown): ProviderConfig["protocol"] | undefined { return value === "openai-responses" || value === "anthropic-messages" || value === "openai-chat" || value === "ollama-tags" ? value : undefined; }

function idOk(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(value); }
