import type { AuditStore, AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import { findPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import { pluginView } from "./local-api-state.ts";
import { type RuntimeState } from "./runtime-state.ts";
import { auditViews } from "./audit-view.ts";
import { auditFilterForUser } from "./local-api-scope.ts";
import { canManage, type AuthUser } from "./auth-state.ts";
import { auditPath } from "./request-path.ts";
import type { PluginHost } from "./plugin-host.ts";

type PluginDataResult = { status: number; payload: unknown };

export async function buildPluginData(id: string, audit: AuditStore, state: RuntimeState, user: AuthUser | undefined, host: PluginHost): Promise<PluginDataResult> {
  const plugin = findPlugin(id);
  if (!plugin) return { status: 404, payload: { error: "unknown_plugin" } };
  if (!plugin.dataPath) return { status: 404, payload: { error: "plugin_data_not_found" } };
  const result = await host.data(id, {
    canManage: canManage(state, user),
    userId: user?.id,
    teamIds: user?.teamIds ?? [],
    scope: "data",
    plugin: pluginView(plugin, state) as unknown as Record<string, unknown>,
    scopes: plugin.dataScopes ?? [],
    manifests: await scopedManifests(audit, state, user),
    memoryGraph: state.memoryGraph
  });
  return result.ok === true ? { status: 200, payload: result.payload } : { status: result.status, payload: { error: result.error } };
}

async function scopedManifests(audit: AuditStore, state: RuntimeState, user?: AuthUser): Promise<AuditManifest[]> {
  const page = await audit.listPage({ limit: 200, newestFirst: true, filter: auditFilterForUser(state, user) });
  return auditViews(page.items).filter(isAgentTraffic);
}

function isAgentTraffic(manifest: AuditManifest): boolean {
  const path = auditPath(manifest.path);
  return !path.startsWith("/.well-known/appspecific/") && path !== "/favicon.ico";
}
