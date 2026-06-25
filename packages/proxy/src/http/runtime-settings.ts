import { existsSync, readFileSync, renameSync } from "node:fs";
import { rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { defaultDataDir } from "../../../core/src/storage/local-paths.ts";
import { ensurePrivateDir, writePrivateFile } from "../../../core/src/storage/private-state.ts";
import { CONTROL_PLANE_LIMITS, type AgentDraftMetadata, type RoutingMode, type RuntimeState } from "./runtime-state.ts";

export type RuntimeSettings = {
  activeProviderId?: string;
  routingMode?: RoutingMode;
  pluginEnabled?: Record<string, boolean>;
  pluginOrder?: string[];
  providerWeights?: Record<string, number>;
  providers?: PersistedProvider[];
  consumerBudgets?: Record<string, number>;
  agentDrafts?: AgentDraftMetadata[];
};
export type RuntimeSettingsLoad = { settings: RuntimeSettings; warning?: string };
type PersistedProvider = Pick<ProviderConfig, "id" | "name" | "kind" | "target" | "credentialEnv" | "credentialRef" | "authScheme" | "protocol" | "enabled" | "allowDistribution">;

const BUILT_IN_IDS = new Set(["default", "openai-env", "anthropic-env", "ollama-local", "lmstudio-local"]);

const FILE = "runtime-settings.json";

export function loadRuntimeSettings(dataDir: string | undefined): RuntimeSettingsLoad {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return { settings: {} };
  try { return { settings: cleanSettings(JSON.parse(readFileSync(file, "utf8"))) }; } catch {
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

function settingsFile(dataDir: string | undefined): string {
  return join(dataDir ?? defaultDataDir(), FILE);
}

function persistableProvider(provider: ProviderConfig): boolean {
  return !BUILT_IN_IDS.has(provider.id) && !provider.runtimeAuthDir && !provider.credentialValue;
}

function persistedProvider(provider: ProviderConfig): PersistedProvider {
  const { id, name, kind, target, credentialEnv, credentialRef, authScheme, protocol, enabled, allowDistribution } = provider;
  return { id, name, kind, target, credentialEnv, credentialRef, authScheme, protocol, enabled, allowDistribution };
}

function cleanSettings(value: unknown): RuntimeSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as RuntimeSettings;
  return { ...input, consumerBudgets: cleanBudgets(input.consumerBudgets), agentDrafts: cleanDrafts(input.agentDrafts) };
}

function cleanBudgets(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  for (const [id, limit] of Object.entries(value)) {
    if (/^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(id) && typeof limit === "number" && Number.isInteger(limit) && limit > 0) out[id] = limit;
  }
  return out;
}

function cleanDrafts(value: unknown): AgentDraftMetadata[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, CONTROL_PLANE_LIMITS.agentDrafts).filter(isDraft).map(persistedDraft);
}

function isDraft(value: unknown): value is AgentDraftMetadata {
  if (!value || typeof value !== "object") return false;
  const item = value as AgentDraftMetadata;
  return idOk(item.id) && idOk(item.providerId) && typeof item.label === "string" && Array.isArray(item.enabledPluginIds) && item.status === "draft";
}

function persistedDraft(draft: AgentDraftMetadata): AgentDraftMetadata {
  const copy: AgentDraftMetadata = { ...draft, enabledPluginIds: [...draft.enabledPluginIds] };
  if (!copy.tokenHash) delete copy.tokenHashAlgorithm;
  return copy;
}

function idOk(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(value);
}
