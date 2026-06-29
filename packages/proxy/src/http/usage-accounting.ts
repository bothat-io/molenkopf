import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import { debugLog } from "../../../core/src/debug/debug-log.ts";
import { costEur } from "../../../core/src/identity/pricing.ts";
import { budgetPeriodKey } from "../../../core/src/identity/budget.ts";
import type { BudgetPeriod } from "../../../core/src/identity/types.ts";
import { clientIdForAgent, safeSubjectId } from "./client-identity.ts";
import type { RuntimeState, UsagePeriodTotals, UsageTotals } from "./runtime-types.ts";

export function recordUsage(state: RuntimeState, manifest: AuditManifest): void {
  const cost = costEur(state.identity?.data.pricing?.[manifest.providerId ?? ""], manifest.upstreamInputTokens ?? 0, manifest.upstreamOutputTokens ?? 0);
  const at = new Date(manifest.timestamp);
  if (manifest.providerId) accumulate(state.usageByProvider, manifest.providerId, manifest, cost, at);
  const client = manifest.client;
  if (client) {
    const userId = usageUserId(state, client);
    if (userId) accumulate(state.usageByUser, userUsageKey(userId), manifest, cost, at);
    else if (client.source === "user") accumulate(state.usageByUser, client.id, manifest, cost, at);
    for (const id of agentUsageKeys(client)) accumulate(state.usageByAgent, id, manifest, cost, at);
    if (client.keyId) accumulate(state.usageByKey, client.keyId, manifest, cost, at);
  for (const teamId of client.teamIds ?? []) accumulate(state.usageByTeam, teamId, manifest, cost, at);
  }
  state.usageSnapshotCursor = auditCursor(manifest);
  state.usageSnapshot?.schedule(state);
  debugLog("usage", "recorded", {
    requestId: manifest.requestId,
    providerId: manifest.providerId,
    statusCode: manifest.statusCode,
    inputTokens: manifest.upstreamInputTokens,
    outputTokens: manifest.upstreamOutputTokens,
    cachedTokens: manifest.cachedTokens,
    cacheReadTokens: manifest.cacheReadTokens
  });
}

export function auditCursor(manifest: AuditManifest): string {
  return `${manifest.timestamp}\u0000${manifest.requestId}`;
}

export function userUsageKey(userId: string): string {
  return `user:${userId}`;
}

export function keyTokensUsed(state: RuntimeState, keyId: string, period: BudgetPeriod = "total", now = new Date()): number {
  return tokensOf(usageForPeriod(state.usageByKey[keyId], period, now));
}

export function keyCostUsed(state: RuntimeState, keyId: string, period: BudgetPeriod = "total", now = new Date()): number {
  return costOf(usageForPeriod(state.usageByKey[keyId], period, now));
}

export function userTokensUsed(state: RuntimeState, userId: string, period: BudgetPeriod = "total", now = new Date()): number {
  return tokensOf(usageForPeriod(state.usageByUser[userUsageKey(userId)], period, now));
}

export function userCostUsed(state: RuntimeState, userId: string, period: BudgetPeriod = "total", now = new Date()): number {
  return costOf(usageForPeriod(state.usageByUser[userUsageKey(userId)], period, now));
}

export function teamTokensUsed(state: RuntimeState, teamId: string, period: BudgetPeriod = "total", now = new Date()): number {
  return tokensOf(usageForPeriod(state.usageByTeam[teamId], period, now));
}

export function teamCostUsed(state: RuntimeState, teamId: string, period: BudgetPeriod = "total", now = new Date()): number {
  return costOf(usageForPeriod(state.usageByTeam[teamId], period, now));
}

export function orgTokensUsed(state: RuntimeState, period: BudgetPeriod = "total", now = new Date()): number {
  return Object.values(state.usageByUser).reduce((sum, usage) => sum + tokensOf(usageForPeriod(usage, period, now)), 0);
}

export function orgCostUsed(state: RuntimeState, period: BudgetPeriod = "total", now = new Date()): number {
  return Object.values(state.usageByUser).reduce((sum, usage) => sum + costOf(usageForPeriod(usage, period, now)), 0);
}

export function agentTokensUsed(state: RuntimeState, clientId: string): number {
  return tokensOf(state.usageByAgent[clientId] ?? state.usageByUser[clientId]);
}

export function identityUserIdForAuditId(state: RuntimeState, value: string): string {
  if (!state.identity) return value;
  if (state.identity.getUser(value)) return value;
  const matches = state.identity.listUsers().filter((user) => safeSubjectId(user.id) === value);
  return matches.length === 1 ? matches[0].id : value;
}

function agentUsageKeys(client: NonNullable<AuditManifest["client"]>): string[] {
  const ids = new Set<string>();
  if (client.source === "agent") ids.add(client.id);
  if (client.agentId) ids.add(clientIdForAgent(client.agentId));
  return [...ids];
}

export function usageForPeriod(usage: UsageTotals | undefined, period: BudgetPeriod = "total", now = new Date()): UsagePeriodTotals {
  if (!usage) return { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 };
  return period === "total" ? usage : usage.periods?.[budgetPeriodKey(period, now)] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 };
}

function accumulate(map: Record<string, UsageTotals>, key: string, manifest: AuditManifest, cost: number, at: Date): void {
  const usage = map[key] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 };
  addUsage(usage, manifest, cost);
  usage.periods ??= {};
  for (const period of ["day", "week", "month"] as const) {
    const key = budgetPeriodKey(period, at);
    usage.periods[key] = addUsage(usage.periods[key] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 }, manifest, cost);
  }
  map[key] = usage;
}

function addUsage(usage: UsagePeriodTotals, manifest: AuditManifest, cost: number): UsagePeriodTotals {
  usage.requests++;
  usage.inputTokens += manifest.upstreamInputTokens ?? 0;
  usage.outputTokens += manifest.upstreamOutputTokens ?? 0;
  usage.costEur = (usage.costEur ?? 0) + cost;
  if (manifest.requestedModel) addModelUsage(usage, manifest.requestedModel, manifest, cost);
  return usage;
}

function addModelUsage(usage: UsagePeriodTotals, model: string, manifest: AuditManifest, cost: number): void {
  usage.models ??= {};
  const current = usage.models[model] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 };
  current.requests++;
  current.inputTokens += manifest.upstreamInputTokens ?? 0;
  current.outputTokens += manifest.upstreamOutputTokens ?? 0;
  current.costEur = (current.costEur ?? 0) + cost;
  if (manifest.requestedReasoning) addReasoningUsage(current, manifest.requestedReasoning, manifest, cost);
  usage.models[model] = current;
}

function addReasoningUsage(usage: NonNullable<UsagePeriodTotals["models"]>[string], reasoning: string, manifest: AuditManifest, cost: number): void {
  usage.reasoning ??= {};
  const current = usage.reasoning[reasoning] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costEur: 0 };
  current.requests++;
  current.inputTokens += manifest.upstreamInputTokens ?? 0;
  current.outputTokens += manifest.upstreamOutputTokens ?? 0;
  current.costEur = (current.costEur ?? 0) + cost;
  usage.reasoning[reasoning] = current;
}

function tokensOf(usage: UsageTotals | undefined): number {
  return usage ? usage.inputTokens + usage.outputTokens : 0;
}

function usageUserId(state: RuntimeState, client: NonNullable<AuditManifest["client"]>): string | undefined {
  if (client.keyId) {
    const owner = state.identity?.data.keys[client.keyId]?.ownerUserId;
    if (owner) return owner;
  }
  return client.userId ? identityUserIdForAuditId(state, client.userId) : undefined;
}

function costOf(usage: UsageTotals | undefined): number {
  return usage?.costEur ?? 0;
}
