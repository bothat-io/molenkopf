import type { IncomingMessage, ServerResponse } from "node:http";
import { AuditCursorError, type AuditStore } from "../../../core/src/manifest/audit-store.ts";
import type { EventBus } from "../../../core/src/events/event-bus.ts";
import { summarizeAudit } from "../../../core/src/manifest/audit-summary.ts";
import { loadPluginPage } from "./plugin-page-loader.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { buildPluginData } from "./plugin-data.ts";
import { buildAgentStatus, buildConfig, buildConsumers, buildPluginStatus, buildProviderStatus, buildStats, buildStatus } from "./local-api-state.ts";
import { auditView, auditViews } from "./audit-view.ts";
import { LocalApiError, writeHtml, writeJson } from "./local-api-io.ts";
import { saveAgentDraft } from "./local-api-agent-actions.ts";
import { setConsumerBudget } from "./local-api-consumer-actions.ts";
import { addProvider, removeProvider, selectProvider, setProviderWeight, setProviderWeights, setRoutingMode, updateProvider } from "./local-api-provider-actions.ts";
import { togglePlugin } from "./local-api-plugin-actions.ts";
import { authRequired, canManage, currentUser, type AuthUser } from "./auth-state.ts";
import { login, logout, me, setupAdmin } from "./local-api-auth.ts";
import { reorderPlugin } from "./local-api-pipeline.ts";
import { issueKeyHandler, listKeysHandler, revokeKeyHandler, updateKeyHandler, usageHandler } from "./local-api-keys.ts";
import { listIdentity, putIdentityTeam, putIdentityUser, removeIdentityTeam, removeIdentityUser } from "./local-api-identity.ts";
import { importProviderAuth } from "./local-api-runtime-auth.ts";
import { testProvider, testRuntimeProvider } from "./provider-test.ts";
import { checkControlPlaneWrite } from "./control-plane-guard.ts";
import { getGlobalPluginPolicy, getPluginPolicyEffective, getPluginPolicyEffectiveForPlugin, getTeamPluginPolicy, putGlobalPluginPolicy, putTeamPluginPolicy } from "./local-api-plugin-policies.ts";
import { auditFilterForUser } from "./local-api-scope.ts";
import { purgeRetention } from "./local-api-retention.ts";
import type { PluginHost } from "./plugin-host.ts";
import { runPluginAction } from "./local-api-plugin-actions.ts";
import { streamEvents } from "./local-api-events.ts";

const DEV_REVISION_PATH = "/__molenkopf/dev/revision";
const PUBLIC_PATHS = new Set(["/__molenkopf/health", "/__molenkopf/login", "/__molenkopf/logout", "/__molenkopf/me", "/__molenkopf/setup-admin", DEV_REVISION_PATH]);
const BOOTSTRAP_PATHS = new Set(["/__molenkopf/health", "/__molenkopf/me", "/__molenkopf/setup-admin"]);
const ADMIN_READ_PATHS = new Set(["/__molenkopf/status", "/__molenkopf/plugins", "/__molenkopf/providers", "/__molenkopf/agents", "/__molenkopf/stats", "/__molenkopf/events"]);
const MANAGE_PATHS = new Set([
  "/__molenkopf/plugins/toggle", "/__molenkopf/plugins/reorder", "/__molenkopf/plugin-policies/global", "/__molenkopf/providers/select", "/__molenkopf/providers/weight", "/__molenkopf/providers/weights",
  "/__molenkopf/providers/add", "/__molenkopf/providers/import-auth", "/__molenkopf/providers/test", "/__molenkopf/providers/test-runtime", "/__molenkopf/providers/update", "/__molenkopf/providers/remove",
  "/__molenkopf/routing/mode", "/__molenkopf/consumers/budget", "/__molenkopf/agents/draft",
  "/__molenkopf/identity/users", "/__molenkopf/identity/users/remove",
  "/__molenkopf/identity/teams", "/__molenkopf/identity/teams/remove", "/__molenkopf/retention/purge"
]);

export async function handleLocalRequest(req: IncomingMessage, res: ServerResponse, audit: AuditStore, events: EventBus, state: RuntimeState, pluginHost: PluginHost) {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  try {
    const guard = checkControlPlaneWrite(req, path, state);
    if (guard.ok === false) return writeJson(res, guard.status, { error: guard.error });
    const open = !authRequired(state);
    const user = open ? undefined : currentUser(state, req.headers.cookie ?? null);
    if (open && !BOOTSTRAP_PATHS.has(path)) return writeJson(res, 401, { error: "setup_required" });
    if (!open && !PUBLIC_PATHS.has(path) && !user) return writeJson(res, 401, { error: "unauthorized" });
    if (!open && (MANAGE_PATHS.has(path) || isPluginPolicyAdminPath(path)) && !canManage(state, user)) return writeJson(res, 403, { error: "forbidden" });
    if (!open && ADMIN_READ_PATHS.has(path) && !canManage(state, user)) return writeJson(res, 403, { error: "forbidden" });
    if (!methodAllowed(req.method ?? "GET", path)) return writeJson(res, 405, { error: "method_not_allowed" });
    if (path === "/__molenkopf/login") return login(req, res, state);
    if (path === "/__molenkopf/setup-admin") return setupAdmin(req, res, state);
    if (path === "/__molenkopf/plugins/reorder") return reorderPlugin(req, res, state);
    if (path === "/__molenkopf/plugin-policies/global" && req.method === "GET") return getGlobalPluginPolicy(req, res, state);
    if (path === "/__molenkopf/plugin-policies/global" && req.method === "PUT") return putGlobalPluginPolicy(req, res, state);
    const pluginPolicyEffective = path.match(/^\/__molenkopf\/plugin-policies\/effective\/[^/]+\/[^/]+$/);
    if (pluginPolicyEffective && req.method === "GET") return getPluginPolicyEffectiveForPlugin(req, res, state);
    const pluginPolicyTeamEffective = path.match(/^\/__molenkopf\/plugin-policies\/effective\/([^/]+)$/);
    if (pluginPolicyTeamEffective && req.method === "GET") return getPluginPolicyEffective(req, res, state);
    if (path === "/__molenkopf/logout") return logout(req, res);
    if (path === "/__molenkopf/me") return me(req, res, state);
    if (path === "/__molenkopf/health") return writeJson(res, 200, { ok: true });
    if (path === DEV_REVISION_PATH) return writeDevRevision(res);
    if (path === "/__molenkopf/status") return writeJson(res, 200, buildStatus(state));
    if (path === "/__molenkopf/plugins") return writeJson(res, 200, buildPluginStatus(state));
    if (path === "/__molenkopf/providers") return writeJson(res, 200, buildProviderStatus(state, user));
    if (path === "/__molenkopf/agents") return writeJson(res, 200, buildAgentStatus(state));
    if (path === "/__molenkopf/config") return writeJson(res, 200, buildConfig(state, user));
    if (path === "/__molenkopf/stats") return writeJson(res, 200, buildStats(state));
    if (path === "/__molenkopf/requests/latest") return audit.listPage({ limit: 1, newestFirst: true, filter: auditFilterForUser(state, user) }).then((page) => writeJson(res, 200, auditViews(page.items).at(0) ?? {}));
    if (path === "/__molenkopf/requests") {
      const cursor = url.searchParams.get("cursor") ?? undefined;
      try {
        const page = await audit.listPage({ limit: 200, cursor, newestFirst: true, filter: auditFilterForUser(state, user) });
        return writeJson(res, 200, auditViews(page.items));
      } catch (error) {
        if (error instanceof AuditCursorError) return writeJson(res, 400, { error: "invalid_cursor" });
        throw error;
      }
    }
    if (path === "/__molenkopf/audit/summary") return audit.listPage({ limit: 1000, newestFirst: true, filter: auditFilterForUser(state, user) }).then((page) => writeJson(res, 200, summarizeAudit(auditViews(page.items))));
    if (path === "/__molenkopf/consumers") return writeJson(res, 200, buildConsumers(state, user));
    if (path === "/__molenkopf/events") return streamEvents(req, res, events, state);
    if (path === "/__molenkopf/plugins/toggle") return togglePlugin(req, res, state, pluginHost);
    if (path === "/__molenkopf/providers/select") return selectProvider(req, res, state);
    if (path === "/__molenkopf/providers/weight") return setProviderWeight(req, res, state);
    if (path === "/__molenkopf/providers/weights") return setProviderWeights(req, res, state);
    if (path === "/__molenkopf/providers/add") return addProvider(req, res, state);
    if (path === "/__molenkopf/providers/import-auth") return importProviderAuth(req, res, state);
    if (path === "/__molenkopf/providers/test") return testProvider(req, res, state);
    if (path === "/__molenkopf/providers/test-runtime") return testRuntimeProvider(req, res, state);
    if (path === "/__molenkopf/providers/update") return updateProvider(req, res, state);
    if (path === "/__molenkopf/providers/remove") return removeProvider(req, res, state);
    if (path === "/__molenkopf/routing/mode") return setRoutingMode(req, res, state);
    if (path === "/__molenkopf/consumers/budget") return setConsumerBudget(req, res, state);
    if (path === "/__molenkopf/agents/draft") return saveAgentDraft(req, res, state);
    if (path === "/__molenkopf/keys") return req.method === "POST" ? issueKeyHandler(req, res, state, user) : listKeysHandler(req, res, state, user);
    if (path === "/__molenkopf/keys/update") return updateKeyHandler(req, res, state, user);
    if (path === "/__molenkopf/keys/revoke") return revokeKeyHandler(req, res, state, user);
    const pluginTeamPolicy = path.match(/^\/__molenkopf\/plugin-policies\/teams\/([^/]+)$/);
    if (pluginTeamPolicy) {
      if (req.method === "GET") return getTeamPluginPolicy(req, res, state);
      if (req.method === "PUT") return putTeamPluginPolicy(req, res, state);
      return writeJson(res, 405, { error: "method_not_allowed" });
    }
    if (path === "/__molenkopf/usage") return usageHandler(req, res, state, user);
    if (path === "/__molenkopf/identity") {
      if (!open && !canManage(state, user)) return writeJson(res, 403, { error: "forbidden" });
      return listIdentity(req, res, state);
    }
    if (path === "/__molenkopf/identity/users") return putIdentityUser(req, res, state);
    if (path === "/__molenkopf/identity/users/remove") return removeIdentityUser(req, res, state);
    if (path === "/__molenkopf/identity/teams") return putIdentityTeam(req, res, state);
    if (path === "/__molenkopf/identity/teams/remove") return removeIdentityTeam(req, res, state);
    if (path === "/__molenkopf/retention/purge") return purgeRetention(req, res, audit, state);
    const pluginAction = path.match(/^\/__molenkopf\/plugins\/([^/]+)\/actions\/([^/]+)$/);
    if (pluginAction && req.method === "POST") return runPluginAction(req, res, state, user, pluginHost, events);
    const pluginData = path.match(/^\/__molenkopf\/plugins\/([^/]+)\/data$/);
    if (pluginData) return writePluginData(res, pluginData[1], audit, state, user, pluginHost);
    const pluginPage = path.match(/^\/__molenkopf\/plugins\/([^/]+)\/page$/);
    if (pluginPage && !canManage(state, user)) return writeJson(res, 403, { error: "forbidden" });
    if (pluginPage) return writePluginPage(res, pluginPage[1]);
    writeJson(res, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof LocalApiError) return writeJson(res, error.status, { error: error.code });
    throw error;
  }
}

const GET_ONLY = new Set([
  "/__molenkopf/health", "/__molenkopf/me", DEV_REVISION_PATH, "/__molenkopf/status", "/__molenkopf/plugins", "/__molenkopf/providers", "/__molenkopf/agents",
  "/__molenkopf/config", "/__molenkopf/stats", "/__molenkopf/requests/latest", "/__molenkopf/requests", "/__molenkopf/audit/summary", "/__molenkopf/consumers",
  "/__molenkopf/events", "/__molenkopf/usage", "/__molenkopf/identity"
]);
const POST_ONLY = new Set([
  "/__molenkopf/login", "/__molenkopf/logout", "/__molenkopf/setup-admin", "/__molenkopf/plugins/reorder", "/__molenkopf/plugins/toggle",
  "/__molenkopf/providers/select", "/__molenkopf/providers/weight", "/__molenkopf/providers/weights", "/__molenkopf/providers/add",
  "/__molenkopf/providers/import-auth", "/__molenkopf/providers/test", "/__molenkopf/providers/test-runtime", "/__molenkopf/providers/update",
  "/__molenkopf/providers/remove", "/__molenkopf/routing/mode", "/__molenkopf/consumers/budget", "/__molenkopf/agents/draft", "/__molenkopf/keys/update",
  "/__molenkopf/keys/revoke", "/__molenkopf/identity/users", "/__molenkopf/identity/users/remove", "/__molenkopf/identity/teams",
  "/__molenkopf/identity/teams/remove", "/__molenkopf/retention/purge"
]);

function methodAllowed(method: string, path: string): boolean {
  const upper = method.toUpperCase();
  if (path === "/__molenkopf/keys") return upper === "GET" || upper === "POST";
  if (path === "/__molenkopf/plugin-policies/global") return upper === "GET" || upper === "PUT";
  if (GET_ONLY.has(path)) return upper === "GET";
  if (POST_ONLY.has(path)) return upper === "POST";
  if (/^\/__molenkopf\/plugin-policies\/teams\/[^/]+$/.test(path)) return upper === "GET" || upper === "PUT";
  if (/^\/__molenkopf\/plugins\/[^/]+\/actions\/[^/]+$/.test(path)) return upper === "POST";
  if (/^\/__molenkopf\/plugin-policies\/effective\/[^/]+\/[^/]+$/.test(path)) return upper === "GET";
  if (/^\/__molenkopf\/plugin-policies\/effective\/[^/]+$/.test(path)) return upper === "GET";
  if (/^\/__molenkopf\/plugins\/[^/]+\/(?:data|page)$/.test(path)) return upper === "GET";
  return true;
}

function isPluginPolicyAdminPath(path: string): boolean {
  return path === "/__molenkopf/plugin-policies/global" || /^\/__molenkopf\/plugin-policies\/teams\/[^/]+$/.test(path);
}

function writeDevRevision(res: ServerResponse) {
  if (process.env.MOLENKOPF_PROFILE !== "dev") return writeJson(res, 404, { error: "not_found" });
  return writeJson(res, 200, { revision: process.env.MOLENKOPF_DEV_REVISION || "dev" });
}

function writePluginPage(res: ServerResponse, id: string) {
  const html = loadPluginPage(id);
  if (!html) return writeJson(res, 404, { error: "plugin_page_not_found" });
  writeHtml(res, html);
}

async function writePluginData(res: ServerResponse, id: string, audit: AuditStore, state: RuntimeState, user: AuthUser | undefined, pluginHost: PluginHost) {
  const result = await buildPluginData(id, audit, state, user, pluginHost);
  writeJson(res, result.status, result.payload);
}
