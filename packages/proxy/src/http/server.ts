import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import { EventBus } from "../../../core/src/events/event-bus.ts";
import { type RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import { builtinMiddlewares, runRequestPipeline, type PluginContext } from "./plugin-pipeline.ts";
import { orderIndex } from "./local-api-pipeline.ts";
import { RetrievalStore } from "../../../core/src/store/retrieval-store.ts";
import { buildForwardHeaders, missingProviderCredential } from "./header-utils.ts";
import { handleLocalRequest } from "./local-api.ts";
import { createRuntimeState, emptyUsage, resolveRequestPluginIds } from "./runtime-state.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { resolveRouting } from "./agent-router.ts";
import { finishProxyRequest } from "./request-finish.ts";
import { resolveClientIdentity, stripMolenkopfAuthHeaders } from "./proxy-identity.ts";
import { checkBudgets } from "./budget-gate.ts";
import { withBudgetWarnings } from "./budget-warnings.ts";
import { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import { UsageSnapshotStore } from "../../../core/src/identity/usage-snapshot.ts";
import { isCliProvider, isModelListPath, runCliProvider } from "../runtime/cli-provider.ts";
import { canStreamCli, streamCliProvider } from "./cli-stream-response.ts";
import { forwardStream } from "./streaming-proxy.ts";
import { createResponseUsageScanner } from "./encoded-usage-meter.ts";
import { auditPath } from "./request-path.ts";
import { requestModelMetadataFromBody } from "./request-model.ts";
import { inputError, listen, readBody, writeJson, writeRedirect } from "./server-io.ts";
import { requirePublicBindFlag } from "./public-bind.ts";
import { providerAllowedForClient } from "./provider-access.ts";
import { restoreUsage } from "./usage-restore.ts";
import { handleDashboardFaviconRequest, handleDashboardRequest, isDashboardRequest } from "./dashboard-assets.ts";
import { createPluginHost, type PluginHost } from "./plugin-host.ts";
import { applyDefaultModel, effectiveRequestPolicy, enforceModelPolicy } from "./request-policy.ts";
import { rejectBudget } from "./budget-response.ts";
import { handleCliModelListResponse } from "./cli-model-list-response.ts";
import { finishRejectedProxyRequest } from "./rejected-proxy-response.ts";
import type { ProxyOptions, RunningProxy } from "./server-types.ts";
export async function startProxy(options: ProxyOptions): Promise<RunningProxy> {
  const host = options.host ?? "127.0.0.1";
  requirePublicBindFlag(host, options.allowPublicBind);
  const state = createRuntimeState(options, host), identity = new IdentityStore(options.dataDir);
  await identity.load(); state.identity = identity;
  const usageSnapshot = new UsageSnapshotStore(options.dataDir), store = new RetrievalStore(options.dataDir), audit = new AuditStore(options.dataDir);
  await restoreUsage(state, usageSnapshot, audit); state.usageSnapshot = usageSnapshot;
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
      await pluginHost.stop().catch(() => {}); usageSnapshot.schedule(state); await usageSnapshot.close(); identity.close();
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  };
}
async function handle(req: IncomingMessage, res: ServerResponse, store: RetrievalStore, audit: AuditStore, events: EventBus, state: RuntimeState, pluginHost: PluginHost) {
  try {
    if (req.url === "/") return writeRedirect(res, "/__molenkopf/dashboard");
    const probePath = auditPath(req.url); if (probePath === "/favicon.ico") return await handleDashboardFaviconRequest(req, res);
    if (probePath.startsWith("/.well-known/appspecific/")) { res.writeHead(204); return res.end(); }
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
  const started = Date.now(), requestId = randomUUID(), rawPath = req.url ?? "/", path = auditPath(rawPath);
  const method = req.method ?? "GET";
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
  events.emit("request_started", { requestId, data: { method, path } });
  const reject = (status: number, error: string, audit?: RewriteAudit, requestModel?: ReturnType<typeof requestModelMetadataFromBody>) =>
    finishRejectedProxyRequest({ res, auditStore, events, state, pluginHost, pluginIds: requestPluginIds, requestId, method, path, target: provider.target, providerId: provider.id, started, client, status, error, audit, requestModel });
  let originalBody: string;
  try { originalBody = await readBody(req); } catch (error) {
    const input = inputError(error); return reject(input?.status ?? 502, input?.code ?? "proxy_error");
  }
  const jsonRequest = (inbound.get("content-type") ?? "").includes("application/json");
  let body = originalBody;
  if (jsonRequest && body) {
    const defaulted = applyDefaultModel(policy, body);
    if (defaulted.ok === false) return reject(defaulted.status, defaulted.error);
    body = defaulted.body;
    const modelPolicy = enforceModelPolicy(policy, body);
    if (modelPolicy.ok === false) return reject(modelPolicy.status, modelPolicy.error, undefined, requestModelMetadataFromBody(body, provider));
  }
  const requestModel = jsonRequest ? requestModelMetadataFromBody(body, provider) : undefined; let audit: RewriteAudit | undefined;
  if (jsonRequest && originalBody) {
    const ctx: PluginContext = {
      requestId, method, path, consumerId: client.id, providerId: provider.id,
      body, redactedSecrets: 0, compressedItems: 0, savedTokens: 0, retrievalIds: [], compressorsUsed: [], notes: [],
      usageOf: (id) => state.usageByAgent[id] ?? emptyUsage(),
      note(message) { ctx.notes.push(message); }
    };
    const ordered = [...builtinMiddlewares].sort((a, b) => orderIndex(state, a.id) - orderIndex(state, b.id));
    await runRequestPipeline(ctx, (id) => requestPluginIds.includes(id), { store }, ordered);
    if (ctx.block) return reject(ctx.block.status, ctx.block.error, undefined, requestModel);
    if (ctx.providerId !== provider.id) {
      const next = state.providers.find((item) => item.id === ctx.providerId && item.enabled !== false);
      if (next) {
        if (!providerAllowedForClient(client, next.id)) return reject(403, "provider_forbidden", undefined, requestModel);
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
  if (missingProviderCredential(provider)) return reject(502, "missing_provider_credential", audit, requestModel);
  const headers = buildForwardHeaders(inbound, provider);
  if (body) headers.set("content-length", String(Buffer.byteLength(body)));
  const finish = (statusCode: number, usage?: Parameters<typeof finishProxyRequest>[0]["usage"]) =>
    finishProxyRequest({ auditStore, events, state, pluginHost, pluginIds: requestPluginIds, requestId, method, path, target, providerId: provider.id, started, client, statusCode, audit, usage, requestModel });
  if (isCliProvider(provider)) {
    events.emit("request_forwarded", { requestId, data: { path } });
    if (isModelListPath(path)) return handleCliModelListResponse({ res, auditStore, events, state, pluginHost, requestPluginIds, requestId, method, path, target, provider, started, client });
    if (canStreamCli(path, body)) {
      const cli = await streamCliProvider(provider, body, requestId, path, res);
      await finish(cli.status, cli.usage);
      return;
    }
    const abort = new AbortController();
    let cliDone = false;
    const abortCli = () => { if (!cliDone) abort.abort(); };
    req.once("aborted", abortCli);
    res.once("close", abortCli);
    try {
      const cli = await runCliProvider(provider, body, requestId, path, { signal: abort.signal });
      cliDone = true;
      await finish(cli.status, cli.usage);
      res.writeHead(cli.status, cli.headers);
      return res.end(cli.body);
    } catch (error) {
      cliDone = true; await finish(502);
      if (res.destroyed) return;
      return writeJson(res, 502, { error: "proxy_error", requestId });
    } finally {
      cliDone = true;
      req.off("aborted", abortCli);
      res.off("close", abortCli);
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
    await finish(502);
    if (!res.headersSent) return writeJson(res, 502, { error: "proxy_error", requestId });
    return res.end();
  }
  await finish(statusCode, await scanner.finish());
}
const headerValue = (value: number | string | string[] | undefined) => Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
