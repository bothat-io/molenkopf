import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import type { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import type { UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import type { ResolvedAgent } from "../../../core/src/config/config-policies.ts";
import type { PluginPolicyStore } from "../../../core/src/plugins/plugin-policy.ts";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import type { CommunicationGraph } from "./communication-graph.ts";
import type { MemoryGraph } from "../../../core/src/memory/memory-graph.ts";

export type { ResolvedAgent };

export type RuntimeAuthProofStore = Record<string, { digest: string; expiresAt: number }>;

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
