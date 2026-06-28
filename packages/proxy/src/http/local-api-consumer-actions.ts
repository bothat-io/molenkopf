import type { IncomingMessage, ServerResponse } from "node:http";
import { buildConsumers } from "./local-api-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import type { RuntimeState } from "./runtime-types.ts";

export async function setConsumerBudget(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return writeJson(res, 400, { error: "invalid_consumer" });
  const previous = { ...state.consumerBudgets };
  if (body.limit === null || body.limit === 0) delete state.consumerBudgets[id];
  else if (typeof body.limit === "number" && Number.isInteger(body.limit) && body.limit > 0) state.consumerBudgets[id] = body.limit;
  else return writeJson(res, 400, { error: "invalid_limit" });
  try { await persistRuntimeSettings(state); } catch {
    state.consumerBudgets = previous;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, buildConsumers(state));
}
