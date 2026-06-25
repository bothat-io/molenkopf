import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import { RetrievalStore } from "../../../core/src/store/retrieval-store.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";

type PurgeScope = "audit" | "retrieval" | "all";

export async function purgeRetention(req: IncomingMessage, res: ServerResponse, audit: AuditStore, state: RuntimeState) {
  const body = await readJson(req);
  const scope = parseScope(body.scope);
  if (!scope) return writeJson(res, 400, { error: "invalid_purge_scope" });
  const purged = { audit: false, retrieval: false };
  if (scope === "audit" || scope === "all") {
    await audit.purgeAll();
    state.latest = undefined;
    purged.audit = true;
  }
  if (scope === "retrieval" || scope === "all") {
    await new RetrievalStore(state.dataDir).purgeAll();
    purged.retrieval = true;
  }
  writeJson(res, 200, { ok: true, purged });
}

function parseScope(value: unknown): PurgeScope | undefined {
  return value === "audit" || value === "retrieval" || value === "all" ? value : undefined;
}
