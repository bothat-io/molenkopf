import type { Budget } from "../../../core/src/identity/types.ts";
import { keyCostUsed, keyTokensUsed, orgCostUsed, orgTokensUsed, teamCostUsed, teamTokensUsed, userCostUsed, userTokensUsed, type RuntimeState } from "./runtime-state.ts";
import type { ClientIdentity } from "./client-identity.ts";

// Hierarchical budget enforcement: key -> user -> team(s) -> org. The first
// exceeded tier with onExceed="block" wins (429). "warn" tiers are reported but
// allowed. Periodic budgets read only the active UTC usage bucket.

export type BudgetCheck =
  | { ok: true; warnings: string[] }
  | { ok: false; status: 429; error: string; tier: string; scopeId: string; metric: "tokens" | "cost" };

export function checkBudgets(state: RuntimeState, client: ClientIdentity, now = new Date()): BudgetCheck {
  const identity = state.identity;
  if (!identity) return { ok: true, warnings: [] };
  const warnings: string[] = [];

  const tiers: { tier: string; scopeId: string; budget?: Budget; tokens: number; cost: number }[] = [];
  const keyBudget = client.keyId ? identity.data.keys[client.keyId]?.budget : undefined;
  if (client.keyId) tiers.push({ tier: "key", scopeId: client.keyId, budget: keyBudget, tokens: keyTokensUsed(state, client.keyId, keyBudget?.period, now), cost: keyCostUsed(state, client.keyId, keyBudget?.period, now) });
  const userBudget = client.userId ? identity.getUser(client.userId)?.budget : undefined;
  if (client.userId) tiers.push({ tier: "user", scopeId: client.userId, budget: userBudget, tokens: userTokensUsed(state, client.userId, userBudget?.period, now), cost: userCostUsed(state, client.userId, userBudget?.period, now) });
  for (const teamId of client.teamIds ?? []) {
    const budget = identity.getTeam(teamId)?.budget;
    tiers.push({ tier: "team", scopeId: teamId, budget, tokens: teamTokensUsed(state, teamId, budget?.period, now), cost: teamCostUsed(state, teamId, budget?.period, now) });
  }
  const orgBudget = identity.data.orgBudget;
  tiers.push({ tier: "org", scopeId: "org", budget: orgBudget, tokens: orgTokensUsed(state, orgBudget?.period, now), cost: orgCostUsed(state, orgBudget?.period, now) });

  for (const t of tiers) {
    const metric = exceededMetric(t);
    if (!metric) continue;
    if (t.budget?.onExceed === "warn") { warnings.push(`${t.tier}:${t.scopeId} over ${metric} budget`); continue; }
    return { ok: false, status: 429, error: `budget_exceeded_${t.tier}`, tier: t.tier, scopeId: t.scopeId, metric };
  }
  return { ok: true, warnings };
}

function exceededMetric(t: { budget?: Budget; tokens: number; cost: number }): "tokens" | "cost" | undefined {
  const tokenLimit = t.budget?.tokenLimit;
  if (typeof tokenLimit === "number" && tokenLimit > 0 && t.tokens >= tokenLimit) return "tokens";
  const costLimit = t.budget?.costLimitEur;
  if (typeof costLimit === "number" && costLimit > 0 && t.cost >= costLimit) return "cost";
  return undefined;
}
