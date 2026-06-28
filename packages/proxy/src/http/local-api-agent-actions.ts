import type { IncomingMessage, ServerResponse } from "node:http";
import { upsertAgentDraft } from "./agent-drafts.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import type { RuntimeState } from "./runtime-types.ts";

export async function saveAgentDraft(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const previous = state.agentDrafts.map((draft) => ({ ...draft, enabledPluginIds: [...draft.enabledPluginIds] }));
  const result = upsertAgentDraft(state, body);
  if (result.ok === false) return writeJson(res, result.status, { error: result.error, reason: result.reason });
  try { await persistRuntimeSettings(state); } catch {
    state.agentDrafts = previous;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, { item: result.value, tokenPolicy: "hash-only; raw token values rejected" });
}
