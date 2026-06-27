import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import { EventBus } from "../../../core/src/events/event-bus.ts";
import { type RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";
import { builtinMiddlewares, runRequestPipeline, type PluginContext } from "./plugin-pipeline.ts";
import { orderIndex } from "./local-api-pipeline.ts";
import { extractConcepts } from "../../../core/src/memory/memory-extractor.ts";
import { recordConcepts } from "../../../core/src/memory/memory-graph.ts";
import { RetrievalStore } from "../../../core/src/store/retrieval-store.ts";
import { buildForwardHeaders, missingProviderCredential } from "./header-utils.ts";
import { handleLocalRequest } from "./local-api.ts";
import { createRuntimeState, emptyUsage, resolveRequestPluginIds, type RuntimeState } from "./runtime-state.ts";
import { resolveRouting } from "./agent-router.ts";
import { buildManifest, finishRequest } from "./request-finish.ts";
import { resolveClientIdentity, stripMolenkopfAuthHeaders } from "./proxy-identity.ts";
import { checkBudgets } from "./budget-gate.ts";
import { withBudgetWarnings } from "./budget-warnings.ts";
import { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import { UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import { isCliProvider, runCliProvider } from "../runtime/cli-provider.ts";
import { canStreamOpenAiCli, streamOpenAiCliProvider } from "./cli-stream-response.ts";
import { forwardStream } from "./streaming-proxy.ts";
import { createResponseUsageScanner } from "./encoded-usage-meter.ts";
import { auditPath } from "./request-path.ts";
import { inputError, listen, readBody, writeJson, writeRedirect } from "./server-io.ts";
import { requirePublicBindFlag } from "./public-bind.ts";
import { providerAllowedForClient } from "./provider-access.ts";
import { restoreUsage } from "./usage-restore.ts";
import { handleDashboardRequest, isDashboardRequest } from "./dashboard-assets.ts";
import { createPluginHost, type PluginHost } from "./plugin-host.ts";
import { effectiveRequestPolicy, enforceModelPolicy } from "./request-policy.ts";
import type { ProxyOptions, RunningProxy } from "./server-types.ts";
export async function startProxy(options: ProxyOptions): Promise<RunningProxy> {
  const host = options.host ?? "127.0.0.1";
  requirePublicBindFlag(host, options.allowPublicBind);
  const state = createRuntimeState(options, host);
  const identity = new IdentityStore(options.dataDir);
  await identity.load();
  state.identity = identity;
  const usageSnapshot = new UsageSnapshotStore(options.dataDir);
  const store = new RetrievalStore(options.dataDir);
  const audit = new AuditStore(options.dataDir);
  await restoreUsage(state, usageSnapshot, audit);
  state.usageSnapshot = usageSnapshot;
  const events = new EventBus(), pluginHost = createPluginHost(state, { store, events });
  await pluginHost.boot();
  const server = createServer((req, res) => handle(req, res, store, audit, events, state, pluginHost));
  await listen(server, options.port, host);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  state.port = port;
  await pluginHost.start(port);
  return {
    port,
    close: async () => {
      await pluginHost.stop().catch(() => {});
      usageSnapshot.schedule(state);
      await usageSnapshot.close();
      identity.close();
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  };
}
async function handle(req: IncomingMessage, res: ServerResponse, store: RetrievalStore, audit: AuditStore, events: EventBus, state: RuntimeState, pluginHost: PluginHost) {
  try {
    if (req.url === "/") return writeRedirect(res, "/__molenkopf/dashboard");
    const probePath = auditPath(req.url);
    if (probePath === "/favicon.ico" || probePath.startsWith("/.well-known/appspecific/")) { res.writeHead(204); return res.end(); }
    if (isDashboardRequest(req.url)) return await handleDashboardRequest(req, res);
    if (req.url?.startsWith("/__molenkopf/")) return await handleLocalRequest(req, res, audit, events, state, pluginHost);
    await handleProxy(req, res, store, audit, events, state, pluginHost);
  } catch (error) {
    const input = inputError(error);
    if (input) return writeJson(res, input.status, { error: input.code });
    events.emit("request_failed", { data: { error: "proxy_error" } });
    writeJson(res, 502, { error: "proxy_error" });
  }
}
async function handleProxy(req: IncomingMessage, res: ServerResponse, store: RetrievalStore, auditStore: AuditStore, events: EventBus, state: RuntimeState, pluginHost: PluginHost) {
  const started = Date.now();
  const requestId = randomUUID();
  const rawPath = req.url ?? "/";
  const path = auditPath(rawPath);
  const inbound = new Headers(req.headers as Record<string, string>);
  const resolved = resolveClientIdentity(state.identity, inbound);
  if (!resolved.keyOk) {
    events.emit("request_failed", { requestId, data: { error: "invalid_api_key" } });
    return writeJson(res, 401, { error: "invalid_api_key" });
  }
  const client = resolved.client;
  const policy = effectiveRequestPolicy(state, inbound, client);
  const requestPluginIds = resolveRequestPluginIds(state, client.teamIds);
  pluginHost?.setRequestPlugins(requestId, requestPluginIds);
  stripMolenkopfAuthHeaders(inbound);
  const budget = checkBudgets(state, client);
  if (budget.ok === false) return rejectBudget(res, events, requestId, budget);
  for (const warning of budget.warnings) events.emit("request_warning", { requestId, data: { warning } });
  const routing = resolveRouting(state, inbound, client);
  if (routing.ok === false) {
    events.emit("request_failed", { requestId, data: { error: routing.error } });
    return writeJson(res, routing.status, { error: routing.error });
  }
  let provider = routing.provider;
  events.emit("request_started", { requestId, data: { method: req.method, path } });
  const originalBody = await readBody(req);
  const jsonRequest = (inbound.get("content-type") ?? "").includes("application/json");
  if (jsonRequest && originalBody) {
    const modelPolicy = enforceModelPolicy(policy, originalBody);
    if (modelPolicy.ok === false) { events.emit("request_failed", { requestId, data: { error: modelPolicy.error } }); return writeJson(res, modelPolicy.status, { error: modelPolicy.error }); }
  }
  if (requestPluginIds.includes("obsidian-graph-plugin") && originalBody) {
    recordConcepts(state.memoryGraph, extractConcepts(redactSecrets(originalBody).text), new Date().toISOString());
  }
  let body = originalBody;
  let audit: RewriteAudit | undefined;
  if (jsonRequest && originalBody) {
    const ctx: PluginContext = {
      requestId, method: req.method ?? "GET", path, consumerId: client.id, providerId: provider.id,
      body: originalBody, redactedSecrets: 0, compressedItems: 0, savedTokens: 0, retrievalIds: [], compressorsUsed: [], notes: [],
      usageOf: (id) => state.usageByAgent[id] ?? emptyUsage(),
      note(message) { ctx.notes.push(message); }
    };
    const ordered = [...builtinMiddlewares].sort((a, b) => orderIndex(state, a.id) - orderIndex(state, b.id));
    await runRequestPipeline(ctx, (id) => requestPluginIds.includes(id), { store }, ordered);
    if (ctx.block) { events.emit("request_failed", { requestId, data: { error: ctx.block.error } }); return writeJson(res, ctx.block.status, { error: ctx.block.error }); }
    if (ctx.providerId !== provider.id) {
      const next = state.providers.find((item) => item.id === ctx.providerId && item.enabled !== false);
      if (next) {
        if (!providerAllowedForClient(client, next.id)) { events.emit("request_failed", { requestId, data: { error: "provider_forbidden" } }); return writeJson(res, 403, { error: "provider_forbidden" }); }
        provider = next;
      }
    }
    body = ctx.body;
    audit = {
      compressedItems: ctx.compressedItems,
      estimatedOriginalTokens: estimateTokens(originalBody),
      estimatedCompressedTokens: estimateTokens(body),
      estimatedSavedTokens: ctx.savedTokens,
      redactedSecrets: ctx.redactedSecrets,
      retrievalIds: ctx.retrievalIds,
      compressorsUsed: ctx.compressorsUsed,
      warnings: ctx.notes
    };
    if (ctx.compressedItems) events.emit("request_compressed", { requestId, data: { items: ctx.compressedItems } });
  }
  audit = withBudgetWarnings(audit, budget.warnings);
  const target = provider.target;
  if (missingProviderCredential(provider)) return writeJson(res, 502, { error: "missing_provider_credential" });
  const headers = buildForwardHeaders(inbound, provider);
  if (body) headers.set("content-length", String(Buffer.byteLength(body)));
  if (isCliProvider(provider)) {
    events.emit("request_forwarded", { requestId, data: { path } });
    if (canStreamOpenAiCli(path, body)) {
      const cli = await streamOpenAiCliProvider(provider, body, requestId, res);
      const manifest = buildManifest(requestId, req.method ?? "GET", path, target, provider.id, cli.status, Date.now() - started, client, audit, cli.usage);
      await finishRequest(manifest, auditStore, events, state, pluginHost, requestPluginIds);
      return;
    }
    try {
      const cli = await runCliProvider(provider, body, requestId, path);
      const manifest = buildManifest(requestId, req.method ?? "GET", path, target, provider.id, cli.status, Date.now() - started, client, audit, cli.usage);
      await finishRequest(manifest, auditStore, events, state, pluginHost, requestPluginIds);
      res.writeHead(cli.status, cli.headers);
      return res.end(cli.body);
    } catch (error) {
      const manifest = buildManifest(requestId, req.method ?? "GET", path, target, provider.id, 502, Date.now() - started, client, audit);
      await finishRequest(manifest, auditStore, events, state, pluginHost, requestPluginIds);
      return writeJson(res, 502, { error: "proxy_error", requestId });
    }
  }
  events.emit("request_forwarded", { requestId, data: { path } });
  let scanner = createResponseUsageScanner(undefined), statusCode: number;
  try {
    const result = await forwardStream(res, target, rawPath, req.method ?? "GET", headers, body || undefined, {
      allowPrivateTarget: provider.kind === "local" || provider.id === "default",
      onResponseHead: (_status, responseHeaders) => { scanner = createResponseUsageScanner(headerValue(responseHeaders["content-encoding"])); },
      onResponseBody: (chunk) => { scanner.feed(chunk); }
    });
    statusCode = result.statusCode;
  } catch (error) {
    const manifest = buildManifest(requestId, req.method ?? "GET", path, target, provider.id, 502, Date.now() - started, client, audit);
    await finishRequest(manifest, auditStore, events, state, pluginHost, requestPluginIds);
    if (!res.headersSent) return writeJson(res, 502, { error: "proxy_error", requestId });
    return res.end();
  }
const manifest = buildManifest(requestId, req.method ?? "GET", path, target, provider.id, statusCode, Date.now() - started, client, audit, await scanner.finish());
  await finishRequest(manifest, auditStore, events, state, pluginHost, requestPluginIds);
}
function rejectBudget(res: ServerResponse, events: EventBus, requestId: string, budget: Exclude<ReturnType<typeof checkBudgets>, { ok: true }>) { events.emit("request_failed", { requestId, data: { error: budget.error } }); res.writeHead(budget.status, { "content-type": "application/json", "retry-after": "60" }); return res.end(JSON.stringify({ error: budget.error, tier: budget.tier, scope: budget.scopeId, metric: budget.metric })); }
const headerValue = (value: number | string | string[] | undefined) => Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
