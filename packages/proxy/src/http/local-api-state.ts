import { pluginCatalog, type MolenkopfPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import { staticPluginPipeline } from "../../../core/src/plugins/static-pipeline.ts";
import { viewProviders } from "../../../core/src/providers/provider-catalog.ts";
import { summarizeAudit } from "../../../core/src/manifest/audit-summary.ts";
import { weightShares } from "../../../core/src/routing/distribution.ts";
import { activeProvider, CONTROL_PLANE_LIMITS, distributionEligible, emptyUsage, providerWeight, type RuntimeState } from "./runtime-state.ts";
import { canManage, providerAllowed, type AuthUser } from "./auth-state.ts";
import { listAgentDrafts } from "./agent-drafts.ts";
import { orderIndex, redactionBeforeCompression } from "./local-api-pipeline.ts";
import { consumerAllowed } from "./local-api-scope.ts";
import { builtinPluginDescriptorV2 } from "./plugin-platform.ts";

function hostOf(target: string): string {
  if (target.startsWith("cli://")) return target;
  try { return new URL(target).host; } catch { return target; }
}

const BUILT_IN_PROVIDER_IDS = new Set(["openai-env", "anthropic-env", "ollama-local", "lmstudio-local"]);

export function buildStatus(state: RuntimeState) {
  const provider = activeProvider(state);
  return {
    ok: true,
    startedAt: state.startedAt,
    target: provider.target,
    targetHost: hostOf(provider.target),
    activeProviderId: provider.id,
    bindHost: state.host,
    port: state.port,
    requests: state.requests,
    compressedItems: state.compressedItems,
    latestStatusCode: state.latest?.statusCode,
    routingMode: state.routingMode,
    settingsLoadWarning: state.settingsLoadWarning,
    pipeline: staticPluginPipeline,
    remotePluginLoading: false
  };
}

export function buildPluginStatus(state: RuntimeState) {
  const items = pluginCatalog.map((plugin) => ({ ...pluginView(plugin, state), order: plugin.pipelineIndex !== undefined ? orderIndex(state, plugin.id) : undefined }));
  return {
    items,
    staticPipeline: items.filter((item) => item.pipelineIndex !== undefined),
    pipelineSafe: redactionBeforeCompression(state),
    remotePlugins: { enabled: false, reason: "remote plugin loading disabled" }
  };
}

export function buildProviderStatus(state: RuntimeState, user?: AuthUser) {
  const views = viewProviders(state.providers, state.activeProviderId);
  const shares = weightShares(state.providers.filter((item) => item.id !== "default" && distributionEligible(item)).map((item) => ({ id: item.id, weight: providerWeight(state, item.id) })));
  const enriched = views
    .filter((view) => providerAllowed(state, user, view.id))
    .map((view) => ({
      ...view,
      weight: providerWeight(state, view.id),
      sharePercent: shares[view.id] ?? 0,
      usage: state.usageByProvider[view.id] ?? emptyUsage()
    }));
  const configured = enriched.filter((item) => item.id !== "default" && (item.enabled !== false || !BUILT_IN_PROVIDER_IDS.has(item.id)));
  const items = enriched.slice(0, CONTROL_PLANE_LIMITS.providerItems);
  return {
    activeProviderId: state.activeProviderId,
    selectedAt: state.providerSelectedAt,
    routingMode: state.routingMode,
    activeProvider: enriched.find((item) => item.active),
    configuredCount: configured.length,
    hasConfiguredProviders: configured.length > 0,
    configuredItems: configured.slice(0, CONTROL_PLANE_LIMITS.providerItems),
    items,
    hasMore: enriched.length > items.length
  };
}

export function buildAgentStatus(state: RuntimeState) {
  return {
    items: listAgentDrafts(state),
    configured: state.configAgents.map((agent) => ({
      id: agent.id,
      providerId: agent.providerId,
      enabled: agent.enabled !== false,
      profileId: agent.profileId,
      pluginPolicyId: agent.pluginPolicyId,
      allowedModels: agent.allowedModels,
      defaultModel: agent.defaultModel,
      enabledPluginIds: agent.enabledPluginIds
    })),
    limit: CONTROL_PLANE_LIMITS.agentDrafts,
    hasMore: state.agentDrafts.length > CONTROL_PLANE_LIMITS.agentDrafts,
    tokenPolicy: "hash-only; raw token values rejected"
  };
}

export function buildConsumers(state: RuntimeState, user?: AuthUser) {
  const ids = new Set<string>([...Object.keys(state.usageByUser), ...Object.keys(state.usageByAgent), ...Object.keys(state.consumerBudgets)]);
  const items = [...ids].filter((id) => consumerAllowed(state, user, id)).map((id) => ({
    id,
    label: id,
    usage: state.usageByUser[id] ?? state.usageByAgent[id] ?? { requests: 0, inputTokens: 0, outputTokens: 0 },
    budget: state.consumerBudgets[id]
  })).sort((a, b) => (b.usage.inputTokens + b.usage.outputTokens) - (a.usage.inputTokens + a.usage.outputTokens));
  return { items: items.slice(0, 100) };
}

export function buildConfig(state: RuntimeState, user?: AuthUser) {
  if (!canManage(state, user)) return buildUserConfig(state);
  const provider = activeProvider(state);
  return {
    dashboardPath: "/__molenkopf/dashboard",
    localApi: [
      "/__molenkopf/health", "/__molenkopf/status", "/__molenkopf/stats", "/__molenkopf/plugins",
      "/__molenkopf/providers", "/__molenkopf/agents", "/__molenkopf/config", "/__molenkopf/events",
      "/__molenkopf/requests", "/__molenkopf/requests/latest", "/__molenkopf/audit/summary",
      "/__molenkopf/plugins/:id/data"
    ],
    target: provider.target,
    targetHost: hostOf(provider.target),
    bindHost: state.host,
    port: state.port,
    configSource: state.configSource,
    settingsLoadWarning: state.settingsLoadWarning,
    routing: { mode: state.routingMode, activeProfile: state.activeProviderId, profiles: viewProviders(state.providers, state.activeProviderId) },
    agentAccess: { mode: "draft metadata", tokenStorage: "hash only; raw values rejected", providerBinding: "provider profile per agent", draftPath: "/__molenkopf/agents/draft", drafts: state.agentDrafts.length },
    credentialPolicy: "file config uses credential refs; UI-added credentials and imported runtime auth stay local and are not displayed",
    remotePluginLoading: false
  };
}

function buildUserConfig(state: RuntimeState) {
  return {
    dashboardPath: "/__molenkopf/dashboard",
    localApi: ["/__molenkopf/health", "/__molenkopf/me", "/__molenkopf/usage", "/__molenkopf/keys"],
    bindHost: state.host,
    port: state.port,
    credentialPolicy: "credential values are not displayed",
    remotePluginLoading: false
  };
}

export function buildStats(state: RuntimeState) {
  return {
    requests: state.requests,
    compressedItems: state.compressedItems,
    startedAt: state.startedAt,
    host: state.host,
    port: state.port,
    latest: boundLatest(state.latest),
    pluginEnabled: state.pluginEnabled,
    activeProviderId: state.activeProviderId,
    settingsLoadWarning: state.settingsLoadWarning,
    providers: buildProviderStatus(state),
    agentDrafts: buildAgentStatus(state),
    auditSummary: state.latest ? summarizeAudit([state.latest]) : summarizeAudit([]),
    communicationGraph: boundGraph(state.communicationGraph)
  };
}

export function pluginView(plugin: MolenkopfPlugin, state: RuntimeState) {
  const enabled = state.pluginEnabled[plugin.id] ?? plugin.enabledByDefault;
  const lifecycle = state.pluginLifecycle[plugin.id];
  const descriptor = builtinPluginDescriptorV2().find((item) => item.id === plugin.id);
  return {
    ...plugin,
    enabled,
    status: enabled ? "enabled" : "disabled",
    lifecycleStatus: lifecycle?.status ?? (enabled ? "enabled" : "disabled"),
    lifecycleError: lifecycle?.error,
    actions: descriptor?.actions.map((action) => ({
      id: action.id,
      label: action.label,
      risk: action.risk,
      requiredRole: action.requiredRole,
      sideEffects: [...action.sideEffects]
    })) ?? [],
    updatedAt: state.pluginUpdatedAt[plugin.id],
    source: state.pluginUpdatedAt[plugin.id] ? "local" : "default"
  };
}

function boundGraph(graph: RuntimeState["communicationGraph"]) {
  const nodes = graph.nodes.slice(0, CONTROL_PLANE_LIMITS.graphNodes);
  const edges = graph.edges.slice(0, CONTROL_PLANE_LIMITS.graphEdges);
  return { nodes, edges, hasMore: nodes.length < graph.nodes.length || edges.length < graph.edges.length };
}

function boundLatest(latest: RuntimeState["latest"]) {
  return latest ? { ...latest, retrievalIds: latest.retrievalIds.slice(0, 10), warnings: latest.warnings.slice(0, 10) } : undefined;
}
