import { pluginCatalog } from "../../../core/src/plugins/plugin-catalog.ts";
import { staticPluginPipeline } from "../../../core/src/plugins/static-pipeline.ts";
import { buildProviderCatalog, type ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { createCommunicationGraph } from "./communication-graph.ts";
import { createMemoryGraph } from "../../../core/src/memory/memory-graph.ts";
import { restoreRuntimeAuthProviders } from "./runtime-auth-registry.ts";
import { loadRuntimeSettings } from "./runtime-settings.ts";
import { attachLocalProviderCredentials } from "./provider-credential-store.ts";
import { requireSessionSecret } from "./session-secret.ts";
import { buildRuntimePluginPolicyState, resolveRequestPluginIds as resolvePolicyPluginIds } from "./runtime-plugin-policy.ts";
import { CONTROL_PLANE_LIMITS, type RuntimeOptions, type RuntimeState, type RoutingMode, type UsageTotals } from "./runtime-types.ts";

export { CONTROL_PLANE_LIMITS } from "./runtime-types.ts";
export type { AgentDraftMetadata, AgentDraftView, ModelUsageTotals, PluginLifecycle, ResolvedAgent, RuntimeOptions, RuntimeState, RuntimeStateResult, RoutingMode, UsagePeriodTotals, UsageTotals } from "./runtime-types.ts";

export function createRuntimeState(options: RuntimeOptions, host: string): RuntimeState {
  const now = new Date().toISOString();
  const explicit = options.providerCatalogMode === "explicit";
  if (explicit && !(options.providers ?? []).length) throw new Error("explicit provider config requires providers");
  const restored: ReturnType<typeof restoreRuntimeAuthProviders> = explicit ? { providers: [] } : restoreRuntimeAuthProviders(options.dataDir);
  const loadedSettings = loadRuntimeSettings(options.dataDir);
  const settings = loadedSettings.settings;
  const persistedProviders = explicit ? [] : settings.providers ?? [];
  const providers = buildProviderCatalog(options.target, [...(options.providers ?? []), ...persistedProviders, ...restored.providers], process.env, { includeBuiltIns: !explicit, includeEnvProviders: !explicit });
  attachLocalProviderCredentials(options.dataDir, providers);
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

export function providerWeight(state: RuntimeState, id: string): number { return typeof state.providerWeights[id] === "number" ? state.providerWeights[id] : 1; }
export { enabledPluginIds, isPluginEnabled, isPluginEnabledForRequest, isPluginAllowedForRequest, resolveEffectivePluginPolicy } from "./runtime-plugin-policy.ts";
export { agentTokensUsed, keyCostUsed, keyTokensUsed, orgCostUsed, orgTokensUsed, recordUsage, teamCostUsed, teamTokensUsed, usageForPeriod, userCostUsed, userTokensUsed, userUsageKey } from "./usage-accounting.ts";
