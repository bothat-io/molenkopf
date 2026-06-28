import type { ServerResponse } from "node:http";
import type { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import type { EventBus } from "../../../core/src/events/event-bus.ts";
import type { RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";
import { finishProxyRequest } from "./request-finish.ts";
import type { ClientIdentity } from "./client-identity.ts";
import type { PluginHost } from "./plugin-host.ts";
import type { RequestModelMetadata } from "./request-model.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { writeJson } from "./server-io.ts";

type Args = {
  res: ServerResponse;
  auditStore: AuditStore;
  events: EventBus;
  state: RuntimeState;
  pluginHost: PluginHost;
  pluginIds: readonly string[];
  requestId: string;
  method: string;
  path: string;
  target: string;
  providerId: string;
  started: number;
  client: ClientIdentity;
  status: number;
  error: string;
  audit?: RewriteAudit;
  requestModel?: RequestModelMetadata;
};

export async function finishRejectedProxyRequest(args: Args): Promise<void> {
  args.events.emit("request_failed", { requestId: args.requestId, data: { error: args.error } });
  await finishProxyRequest({ ...args, statusCode: args.status });
  writeJson(args.res, args.status, { error: args.error });
}
