export type ModelUsageTotals = { requests?: number; inputTokens?: number; outputTokens?: number; costEur?: number };
export type UsageTotals = { requests?: number; inputTokens?: number; outputTokens?: number; costEur?: number; models?: Record<string, ModelUsageTotals> };
export type KeyPermissions = { create?: boolean; revoke?: boolean };
export type UserView = { id: string; displayName?: string; role: "admin" | "manager" | "member"; teamIds?: string[]; keyPermissions?: KeyPermissions; canManage?: boolean; usage?: UsageTotals; budget?: Budget; disabled?: boolean; loginDisabled?: boolean; hasPassword?: boolean };
export type TeamView = { id: string; name: string; members?: number; budget?: Budget; usage?: UsageTotals; allowedProviders?: "*" | string[]; managerIds?: string[] };
export type Budget = { tokenLimit?: number; costLimitEur?: number; period?: string; onExceed?: "block" | "warn" };
export type Session = { open?: boolean; needsSetup?: boolean; user?: UserView };
export type ApiKeyView = { id: string; prefix: string; ownerUserId: string; agentLabel?: string; teamId?: string; project?: string; disabled?: boolean; lastUsedAt?: string; usage?: UsageTotals };
export type ProviderView = {
  id: string; name?: string; kind?: string; target?: string; runtime?: string; active?: boolean; enabled?: boolean; weight?: number; sharePercent?: number;
  usage?: UsageTotals; runtimeAuthConfigured?: boolean; runtimeProfile?: RuntimeProfileView; allowDistribution?: boolean;
};
export type RuntimeProfileView = { summary?: string[]; diagnostics?: Record<string, unknown> };
export type PluginView = {
  id: string; name: string; type?: string; category?: string; enabled?: boolean; canToggle?: boolean;
  status?: "enabled" | "disabled"; lifecycleStatus?: "enabled" | "disabled" | "booted" | "stopped" | "error"; lifecycleError?: string;
  permissions?: string[]; hooks?: string[]; traffic?: { reads?: string[]; mutates?: string[] };
  pipelineIndex?: number; order?: number; pagePath?: string; dataPath?: string; dataScopes?: string[]; description?: string;
  actions?: { id: string; label: string; risk: string; requiredRole: string; sideEffects: string[] }[];
};
export type PluginPolicyOverride = { enabled?: boolean; maxRisk?: string; capabilities?: string[]; actions?: string[]; settings?: Record<string, unknown> };
export type GlobalPluginPolicyView = {
  pluginPolicySchemaVersion?: number;
  globalPluginPolicy?: Record<string, PluginPolicyOverride>;
  policyWarnings?: string[];
  lastValidatedAt?: string;
};
export type TeamPluginPolicyView = {
  teamId: string;
  pluginPolicySchemaVersion?: number;
  pluginPolicies: Record<string, PluginPolicyOverride>;
};
export type EffectivePluginPolicyItem = {
  pluginId: string;
  globalOverrideExists: boolean;
  teamOverrideExists: boolean;
  policy: {
    enabled: boolean;
    maxRisk: string;
    capabilities: string[];
    actions: string[];
    settings: Record<string, unknown>;
    source: { enabled: string; maxRisk: string; capabilities: string; actions: string; settings: Record<string, string> };
    blockedReasons: string[];
  };
};
export type EffectivePluginPolicyView = { teamId: string; policies: Record<string, EffectivePluginPolicyItem> };
export type TokenOptimizerData = {
  observations?: { requests?: number; inputTokens?: number; outputTokens?: number; savedTokens?: number };
  buckets?: { id: string; label: string; requests: number; inputTokens: number; outputTokens: number }[];
  repeatedContext?: { project: string; endpoint: string; requests: number; repeatedInputTokens: number }[];
  recommendations?: { id: string; kind: string; severity: string; summary: string; action: string }[];
  budgets?: { pressure?: string; warnings?: string[]; totalTokens?: { state: string; value?: number }; budgetLimit?: { state: string; reason?: string } };
  cacheSavings?: { state: string; value?: number; reason?: string };
  estimatedCostEur?: { state: string; value?: number; reason?: string };
};
export type UsageView = { org?: UsageTotals; users?: UserView[]; teams?: TeamView[]; keys?: ApiKeyView[] };
export type ProviderState = { items?: ProviderView[]; configuredItems?: ProviderView[]; activeProvider?: ProviderView; routingMode?: "manual" | "distribute"; activeProviderId?: string };
export type PluginState = { items?: PluginView[]; staticPipeline?: PluginView[]; pipelineSafe?: boolean; remotePlugins?: { enabled?: boolean; reason?: string } };
export type ConfigView = { bindHost?: string; port?: number };
export type SummaryView = { requests?: number; upstreamInputTokens?: number; upstreamOutputTokens?: number; savedTokens?: number; redactedSecrets?: number };
export type IdentityView = { users: UserView[]; teams: TeamView[] };
export type DashboardData = {
  usage: UsageView;
  keys: { items: ApiKeyView[] };
  config: ConfigView;
  providers: ProviderState;
  summary: SummaryView;
  plugins: PluginState;
  identity?: IdentityView;
  pluginPolicies?: {
    global?: GlobalPluginPolicyView;
    teams?: Record<string, TeamPluginPolicyView>;
    effective?: Record<string, EffectivePluginPolicyView>;
  };
  tokenOptimizer?: TokenOptimizerData;
};
