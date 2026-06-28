import type { ServerResponse } from "node:http";
import type { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import type { EventBus } from "../../../core/src/events/event-bus.ts";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { cliModelList } from "../runtime/cli-provider.ts";
import type { ClientIdentity } from "./client-identity.ts";
import { buildManifest, finishRequest } from "./request-finish.ts";
import type { PluginHost } from "./plugin-host.ts";
import type { RuntimeState } from "./runtime-state.ts";

export async function handleCliModelListResponse(input: {
  res: ServerResponse;
  auditStore: AuditStore;
  events: EventBus;
  state: RuntimeState;
  pluginHost: PluginHost;
  requestPluginIds: readonly string[];
  requestId: string;
  method: string;
  path: string;
  target: string;
  provider: ProviderConfig;
  started: number;
  client: ClientIdentity;
}): Promise<void> {
  const cli = cliModelList(input.provider);
  const manifest = buildManifest(input.requestId, input.method, input.path, input.target, input.provider.id, cli.status, Date.now() - input.started, input.client);
  await finishRequest(manifest, input.auditStore, input.events, input.state, input.pluginHost, input.requestPluginIds);
  input.res.writeHead(cli.status, cli.headers);
  input.res.end(cli.body);
}
