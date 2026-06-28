import type { IncomingMessage, ServerResponse } from "node:http";
import { staticPluginPipeline } from "../../../core/src/plugins/static-pipeline.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";

// Optional plugin middleware order. Core request safety is not represented here.
export function pluginOrder(state: RuntimeState): string[] {
  const order = state.pluginOrder?.filter((id) => (staticPluginPipeline as readonly string[]).includes(id)) ?? [];
  for (const id of staticPluginPipeline) if (!order.includes(id)) order.push(id);
  return order;
}

export function orderIndex(state: RuntimeState, id: string): number {
  const i = pluginOrder(state).indexOf(id);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

export function redactionBeforeCompression(_state: RuntimeState): boolean {
  return true;
}

export async function reorderPlugin(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const dir = body.direction === "up" ? -1 : body.direction === "down" ? 1 : 0;
  const order = pluginOrder(state);
  const i = order.indexOf(id);
  if (i < 0 || dir === 0) return writeJson(res, 400, { error: "bad_reorder" });
  const j = i + dir;
  if (j < 0 || j >= order.length) return writeJson(res, 200, { ok: true, order });
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  const previous = state.pluginOrder;
  state.pluginOrder = next;
  try { await persistRuntimeSettings(state); } catch {
    state.pluginOrder = previous;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, { ok: true, order: next });
}
