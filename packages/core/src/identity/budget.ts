import type { Budget, BudgetAction, BudgetPeriod } from "./types.ts";

export const BUDGET_PERIODS: BudgetPeriod[] = ["day", "week", "month", "total"];
export const BUDGET_ACTIONS: BudgetAction[] = ["block", "warn"];
export const DEFAULT_BUDGET_PERIOD: BudgetPeriod = "month";
export const DEFAULT_BUDGET_ACTION: BudgetAction = "block";

export type BudgetParseResult = { ok: true; budget?: Budget } | { ok: false; error: "invalid_budget" };

export function normalizeBudget(value: unknown): BudgetParseResult {
  if (value === undefined || value === null) return { ok: true };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid_budget" };
  const input = value as Record<string, unknown>;
  const tokenLimit = limit(input.tokenLimit);
  const costLimitEur = limit(input.costLimitEur);
  if (tokenLimit === false || costLimitEur === false) return { ok: false, error: "invalid_budget" };
  if (tokenLimit === undefined && costLimitEur === undefined) return { ok: true };
  const period = input.period === undefined ? DEFAULT_BUDGET_PERIOD : input.period;
  const onExceed = input.onExceed === undefined ? DEFAULT_BUDGET_ACTION : input.onExceed;
  if (!BUDGET_PERIODS.includes(period as BudgetPeriod) || !BUDGET_ACTIONS.includes(onExceed as BudgetAction)) return { ok: false, error: "invalid_budget" };
  return { ok: true, budget: { tokenLimit, costLimitEur, period: period as BudgetPeriod, onExceed: onExceed as BudgetAction } };
}

export function isBudget(value: unknown): value is Budget {
  const parsed = normalizeBudget(value);
  return parsed.ok && parsed.budget !== undefined;
}

export function budgetPeriodKey(period: BudgetPeriod, at: Date): string {
  if (period === "total") return "total";
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  const day = String(at.getUTCDate()).padStart(2, "0");
  if (period === "day") return `day:${year}-${month}-${day}`;
  if (period === "month") return `month:${year}-${month}`;
  const { weekYear, week } = isoWeek(at);
  return `week:${weekYear}-W${String(week).padStart(2, "0")}`;
}

function limit(value: unknown): number | undefined | false {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : false;
}

function isoWeek(value: Date): { weekYear: number; week: number } {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const weekYear = date.getUTCFullYear();
  const first = new Date(Date.UTC(weekYear, 0, 1));
  return { weekYear, week: Math.ceil((((date.getTime() - first.getTime()) / 86400000) + 1) / 7) };
}
