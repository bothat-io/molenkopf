import { pluginCatalog } from "../../../core/src/plugins/plugin-catalog.ts";
import { staticPluginPipeline } from "../../../core/src/plugins/static-pipeline.ts";
import { buildProviderCatalog, type ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import { createCommunicationGraph, type CommunicationGraph } from "./communication-graph.ts";
import { createMemoryGraph, type MemoryGraph } from "../../../core/src/memory/memory-graph.ts";
import type { AuthUser } from "./auth-state.ts";
import type { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import type { UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import type { ResolvedAgent } from "../../../core/src/config/config-policies.ts";
import { restoreRuntimeAuthProviders } from "./runtime-auth-registry.ts";
import { loadRuntimeSettings } from "./runtime-settings.ts";
import type { RuntimeAuthProofStore } from "./runtime-auth-proof.ts";
import { requireSessionSecret } from "./session-secret.ts";
import { buildRuntimePluginPolicyState, type PluginPolicyStore, resolveRequestPluginIds as resolvePolicyPluginIds } from "./runtime-plugin-policy.ts";

export type { ResolvedAgent };
export type RuntimeOptions = {
  target: string;
  dataDir?: string;
  providers?: ProviderConfig[];
  activeProviderId?: string;
  configAgents?: ResolvedAgent[];
  providerCatalogMode?: "auto" | "explicit";
  configSource?: { kind: "env" | "file"; path?: string };
};
export const CONTROL_PLANE_LIMITS = {
  agentDrafts: 25,
  providerItems: 50,
  graphNodes: 80,
  graphEdges: 120,
  requestBodyBytes: 8192,
  idLength: 64,
  labelLength: 80,
  pluginIds: 20
};

export type AgentDraftMetadata = {
  id: string;
  label: string;
  kind: "CI agent" | "Local agent" | "External agent";
  providerId: string;
  enabledPluginIds: string[];
  tokenHash?: string;
  tokenHashAlgorithm?: "sha256";
  disabled?: boolean;
  tokenLimit?: number;
  status: "draft";
  createdAt: string;
  updatedAt: string;
};
export type AgentDraftView = Omit<AgentDraftMetadata, "tokenHash"> & { tokenHashPresent: boolean; tokenFingerprint?: string; usage: UsageTotals };

export type ModelUsageTotals = { requests: number; inputTokens: number; outputTokens: number; costEur?: number; reasoning?: Record<string, ModelUsageTotals> };
export type UsagePeriodTotals = { requests: number; inputTokens: number; outputTokens: number; costEur?: number; models?: Record<string, ModelUsageTotals> };
export type UsageTotals = UsagePeriodTotals & { periods?: Record<string, UsagePeriodTotals> };
export type RoutingMode = "manual" | "distribute";
export type PluginLifecycle = { status: "disabled" | "booted" | "enabled" | "stopped" | "error"; hook?: string; error?: string };

export type RuntimeStateResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; reason?: string };

export type RuntimeState = {
  requests: number;
  compressedItems: number;
  startedAt: string;
  host: string;
  port?: number;
  dataDir?: string;
  latest?: AuditManifest;
  pluginEnabled: Record<string, boolean>;
  pluginUpdatedAt: Record<string, string>;
  pluginLifecycle: Record<string, PluginLifecycle>;
  providers: ProviderConfig[];
  activeProviderId: string;
  providerSelectedAt: string;
  routingMode: RoutingMode;
  providerWeights: Record<string, number>;
  pluginOrder: string[];
  usageByProvider: Record<string, UsageTotals>;
  usageByUser: Record<string, UsageTotals>;
  usageByAgent: Record<string, UsageTotals>;
  usageByKey: Record<string, UsageTotals>;
  usageByTeam: Record<string, UsageTotals>;
  consumerBudgets: Record<string, number>;
  configAgents: ResolvedAgent[];
  agentDrafts: AgentDraftMetadata[];
  communicationGraph: CommunicationGraph;
  memoryGraph: MemoryGraph;
  sessionSecret: string;
  authAttempts: Record<string, { count: number; resetAt: number }>;
  runtimeAuthProofs: RuntimeAuthProofStore;
  bootstrapSetup?: Promise<void>;
  settingsLoadWarning?: string;
  configSource: { kind: "env" | "file"; path?: string };
  pluginPolicyState: PluginPolicyStore;
  identity?: IdentityStore;
  usageSnapshot?: UsageSnapshotStore;
};

export function createRuntimeState(options: RuntimeOptions, host: string): RuntimeState {
  const now = new Date().toISOString();
  const explicit = options.providerCatalogMode === "explicit";
  if (explicit && !(options.providers ?? []).length) throw new Error("explicit provider config requires providers");
  const restored: ReturnType<typeof restoreRuntimeAuthProviders> = explicit ? { providers: [] } : restoreRuntimeAuthProviders(options.dataDir);
  const loadedSettings = loadRuntimeSettings(options.dataDir);
  const settings = loadedSettings.settings;
  const persistedProviders = explicit ? [] : settings.providers ?? [];
  const providers = buildProviderCatalog(options.target, [...(options.providers ?? []), ...persistedProviders, ...restored.providers], process.env, { includeBuiltIns: !explicit, includeEnvProviders: !explicit });
  const weights = Object.fromEntries(providers.map((provider) => [provider.id, 1]));
  const requestedActive = options.activeProviderId ?? settings.activeProviderId ?? restored.activeProviderId ?? (explicit ? providers[0]?.id : "default") ?? "default";
  const builtPolicy = buildRuntimePluginPolicyState(settings.pluginPolicy);
  const settingWarnings = [...(loadedSettings.warning ? [loadedSettings.warning] : []), ...builtPolicy.warnings];
  const settingsLoadWarning = settingWarnings.length ? settingWarnings.join("; ") : undefined;
  return {
    requests: 0,
    compressedItems: 0,
    startedAt: now,
    host,
    dataDir: options.dataDir,
    pluginEnabled: normalizedPluginEnabled(settings.pluginEnabled),
    pluginUpdatedAt: {},
    pluginLifecycle: {},
    providers,
    activeProviderId: selectedProviderId(providers, requestedActive),
    providerSelectedAt: now,
    routingMode: cleanRoutingMode(settings.routingMode) ?? restored.routingMode ?? "manual",
    providerWeights: { ...weights, ...(settings.providerWeights ?? {}) },
    pluginOrder: settings.pluginOrder ?? [...staticPluginPipeline],
    usageByProvider: {},
    usageByUser: {},
    usageByAgent: {},
    usageByKey: {},
    usageByTeam: {},
    consumerBudgets: settings.consumerBudgets ?? {},
    configAgents: options.configAgents ?? [],
    agentDrafts: (settings.agentDrafts ?? []).filter((draft) => providers.some((provider) => provider.id === draft.providerId && provider.enabled !== false)),
    communicationGraph: createCommunicationGraph(),
    memoryGraph: createMemoryGraph(),
    sessionSecret: requireSessionSecret(),
    authAttempts: {},
    runtimeAuthProofs: {},
    settingsLoadWarning,
    pluginPolicyState: builtPolicy.state,
    configSource: options.configSource ?? { kind: "env" }
  };
}

export function activeProvider(state: RuntimeState): ProviderConfig {
  return state.providers.find((provider) => provider.id === state.activeProviderId && provider.enabled !== false) ?? firstEnabledProvider(state.providers) ?? state.providers[0];
}

export function repairActiveProvider(state: RuntimeState): boolean {
  const id = activeProvider(state)?.id ?? "default";
  if (state.activeProviderId === id) return false;
  state.activeProviderId = id;
  state.providerSelectedAt = new Date().toISOString();
  return true;
}

export function distributionEligible(provider: ProviderConfig): boolean {
  if (provider.id === "default" || provider.enabled === false || provider.allowDistribution === false) return false;
  return provider.kind !== "cli" || provider.allowDistribution === true || Boolean(provider.runtimeAuthDir);
}

export function resolveRequestPluginIds(state: RuntimeState, teamIds?: readonly string[]): string[] {
  return resolvePolicyPluginIds(state, teamIds);
}

export function emptyUsage(): UsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 };
}

function normalizedPluginEnabled(settings: Record<string, boolean> | undefined): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  for (const plugin of pluginCatalog) {
    const configured = settings?.[plugin.id];
    enabled[plugin.id] = plugin.canToggle && typeof configured === "boolean" ? configured : plugin.enabledByDefault;
  }
  return enabled;
}

function selectedProviderId(providers: ProviderConfig[], requested: string): string {
  const enabled = providers.find((provider) => provider.id === requested && provider.enabled !== false);
  return enabled?.id ?? firstEnabledProvider(providers)?.id ?? providers[0]?.id ?? "default";
}

function firstEnabledProvider(providers: ProviderConfig[]): ProviderConfig | undefined {
  return providers.find((provider) => provider.enabled !== false);
}

function cleanRoutingMode(value: unknown): RoutingMode | undefined {
  return value === "manual" || value === "distribute" ? value : undefined;
}

export function providerWeight(state: RuntimeState, id: string): number {
  const weight = state.providerWeights[id];
  return typeof weight === "number" ? weight : 1;
}
export { enabledPluginIds, isPluginEnabled, isPluginEnabledForRequest, isPluginAllowedForRequest, resolveEffectivePluginPolicy } from "./runtime-plugin-policy.ts";
export { agentTokensUsed, keyCostUsed, keyTokensUsed, orgCostUsed, orgTokensUsed, recordUsage, teamCostUsed, teamTokensUsed, usageForPeriod, userCostUsed, userTokensUsed, userUsageKey } from "./usage-accounting.ts";
