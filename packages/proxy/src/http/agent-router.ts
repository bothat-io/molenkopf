import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { chooseByDistribution } from "../../../core/src/routing/distribution.ts";
import { activeProvider, distributionEligible, providerWeight } from "./runtime-state.ts";
import { agentTokensUsed } from "./usage-accounting.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { clientIdForAgent, safeSubjectId, type ClientIdentity } from "./client-identity.ts";
import { providerAllowedForClient } from "./provider-access.ts";

export type RoutingResult = { ok: true; provider: ProviderConfig } | { ok: false; status: number; error: string };

// Resolves the upstream provider for a request and enforces agent access/budget.
// Priority: explicit agent binding -> distribution mode -> global active provider.
export function resolveRouting(state: RuntimeState, headers: Headers, client: ClientIdentity): RoutingResult {
  const budget = consumerBudget(state, client);
  if (budget && agentTokensUsed(state, client.id) >= budget) return { ok: false, status: 429, error: "consumer_budget" };
  const agentId = cleanAgentId(headers.get("x-molenkopf-agent"));
  if (agentId) {
    const draft = state.agentDrafts.find((item) => item.id === agentId);
    const agentUsageId = clientIdForAgent(agentId);
    if (draft?.disabled) return { ok: false, status: 403, error: "agent_disabled" };
    if (draft?.tokenLimit && agentTokensUsed(state, agentUsageId) >= draft.tokenLimit) {
      return { ok: false, status: 429, error: "agent_token_limit" };
    }
    const configAgent = state.configAgents.find((item) => item.id === agentId);
    if (configAgent?.enabled === false) return { ok: false, status: 403, error: "agent_disabled" };
    if (configAgent && (client.source !== "api_key" || client.keyAgentLabel !== agentId)) return { ok: false, status: 403, error: "agent_forbidden" };
    const pinned = draft?.providerId ?? configAgent?.providerId;
    if (pinned) {
      const provider = enabledProvider(state, pinned);
      if (provider) return requireProviderAccess(client, provider);
      return { ok: false, status: 409, error: "provider_unavailable" };
    }
  }
  if (state.routingMode === "distribute") {
    const distributed = distribute(state, client);
    if (distributed) return { ok: true, provider: distributed };
    return { ok: false, status: 409, error: "no_eligible_provider" };
  }
  return requireProviderAccess(client, activeProvider(state));
}

function consumerBudget(state: RuntimeState, client: ClientIdentity): number | undefined {
  const current = state.consumerBudgets[client.id];
  if (current) return current;
  const legacyUserId = client.userId ? `user:${safeSubjectId(client.userId)}` : undefined;
  return legacyUserId ? state.consumerBudgets[legacyUserId] : undefined;
}

function distribute(state: RuntimeState, client: ClientIdentity): ProviderConfig | undefined {
  const eligible = state.providers.filter((provider) => distributionEligible(provider) && providerAllowedForClient(client, provider.id));
  const shares = eligible.map((provider) => ({
    id: provider.id,
    weight: providerWeight(state, provider.id),
    usedTokens: tokensFor(state, provider.id)
  }));
  const chosen = chooseByDistribution(shares);
  return eligible.find((provider) => provider.id === chosen);
}

function tokensFor(state: RuntimeState, id: string): number {
  const usage = state.usageByProvider[id];
  return usage ? usage.inputTokens + usage.outputTokens : 0;
}

function enabledProvider(state: RuntimeState, id: string): ProviderConfig | undefined {
  return state.providers.find((item) => item.id === id && item.enabled !== false);
}

function requireProviderAccess(client: ClientIdentity, provider: ProviderConfig): RoutingResult {
  if (!providerAllowedForClient(client, provider.id)) return { ok: false, status: 403, error: "provider_forbidden" };
  return { ok: true, provider };
}

function cleanAgentId(value: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(id) ? id : undefined;
}
