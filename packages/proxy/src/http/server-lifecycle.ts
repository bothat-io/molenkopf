import type { Server } from "node:http";
import type { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import type { UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import type { PluginHost } from "./plugin-host.ts";
import type { RuntimeState } from "./runtime-types.ts";

export async function closeRunningProxy(resources: {
  pluginHost: PluginHost;
  usageSnapshot: UsageSnapshotStore;
  identity: IdentityStore;
  state: RuntimeState;
  server: Server;
}): Promise<void> {
  await resources.pluginHost.stop().catch(() => {});
  resources.usageSnapshot.schedule(resources.state);
  await resources.usageSnapshot.close();
  resources.identity.close();
  await closeServer(resources.server);
}

export async function cleanupFailedStartup(resources: {
  pluginHost?: PluginHost;
  pluginBooted: boolean;
  usageSnapshot: UsageSnapshotStore;
  identity: IdentityStore;
  server?: Server;
}): Promise<void> {
  if (resources.pluginBooted) await resources.pluginHost?.stop("startup_failed").catch(() => {});
  await resources.usageSnapshot.close().catch(() => {});
  resources.identity.close();
  if (resources.server?.listening) await closeServer(resources.server).catch(() => {});
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
