import type { ServerResponse } from "node:http";
import type { EventBus } from "../../../core/src/events/event-bus.ts";
import { checkBudgets } from "./budget-gate.ts";

type BudgetRejection = Exclude<ReturnType<typeof checkBudgets>, { ok: true }>;

export function rejectBudget(res: ServerResponse, events: EventBus, requestId: string, budget: BudgetRejection) {
  events.emit("request_failed", { requestId, data: { error: budget.error } });
  res.writeHead(budget.status, { "content-type": "application/json", "retry-after": "60" });
  return res.end(JSON.stringify({
    error: budget.error,
    tier: budget.tier,
    scope: budget.scopeId,
    metric: budget.metric
  }));
}
