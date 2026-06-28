import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { AuditStore } from "../../core/src/manifest/audit-store.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";

test("plugin data endpoints expose scoped compression data without query secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-plugin-data-"));
  let upstreamPath = "";
  const upstream = createServer((req, res) => {
    upstreamPath = req.url ?? "";
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, usage: { input_tokens: 11, output_tokens: 7 } }));
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const identity = new IdentityStore(dir);
  try {
    await identity.load();
    await identity.putUser({ id: "bob", displayName: "Bob", role: "admin", teamIds: [], createdAt: new Date().toISOString() });
    const issued = (await issueApiKey(identity, "bob", { agentLabel: "win1", project: "project-alpha/client" }))!;
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    await new AuditStore(dir).write({
      requestId: "old-browser-probe", timestamp: "2026-06-22T10:00:00.000Z", method: "GET",
      path: "/.well-known/appspecific/com.chrome.devtools.json", targetHost: "127.0.0.1", providerId: "default",
      client: { id: "unattributed", label: "unattributed client", source: "unattributed" },
      compressedItems: 0, estimatedOriginalTokens: 0, estimatedCompressedTokens: 0, estimatedSavedTokens: 0,
      redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [], statusCode: 404, durationMs: 1
    });
    await new AuditStore(dir).write({
      requestId: "old-favicon-probe", timestamp: "2026-06-22T10:00:01.000Z", method: "GET",
      path: "/favicon.ico?token=favicon-secret", targetHost: "127.0.0.1", providerId: "default",
      client: { id: "unattributed", label: "unattributed client", source: "unattributed" },
      compressedItems: 0, estimatedOriginalTokens: 0, estimatedCompressedTokens: 0, estimatedSavedTokens: 0,
      redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [], statusCode: 404, durationMs: 1
    });
    // Compression is opt-in (transparent by default); enable it to assert compressed metrics.
    await fetch(`${base}/__molenkopf/plugins/toggle`, { method: "POST", headers: { "content-type": "application/json", cookie: admin }, body: JSON.stringify({ id: "context-compressor-plugin", enabled: true }) });
    await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${issued.secret}` },
      body: JSON.stringify({ input: "please fix src/app.ts function handleRetry" })
    });
    // Secret-bearing log request last so upstreamPath captures the query for the leak check.
    const longLog = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR done";
    await fetch(`${base}/v1/responses?api_key=super-secret`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${issued.secret}` },
      body: JSON.stringify({ input: longLog })
    });
    const favicon = await fetch(`${base}/favicon.ico`);
    assert.equal(favicon.status, 200);
    const faviconQuery = await fetch(`${base}/favicon.ico?token=favicon-secret`);
    assert.equal(faviconQuery.status, 200);
    const devtoolsProbe = await fetch(`${base}/.well-known/appspecific/com.chrome.devtools.json`);
    assert.equal(devtoolsProbe.status, 204);

    assert.match(upstreamPath, /api_key=super-secret/);
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((response) => response.json());
    assert.equal(latest.path, "/v1/responses");
    assert.doesNotMatch(JSON.stringify(latest), /super-secret|api_key=/);

    const compression = await fetch(`${base}/__molenkopf/plugins/context-compressor-plugin/data`, { headers: { cookie: admin } }).then((response) => response.json());
    assert.equal(compression.plugin.id, "context-compressor-plugin");
    assert.equal(compression.plugin.dataPath, "/__molenkopf/plugins/context-compressor-plugin/data");
    assert.equal(compression.metrics.compressedItems > 0, true);
    assert.equal(compression.metrics.buckets.length > 0, true);
    assert.equal(compression.metrics.providers.length > 0, true);
    assert.equal(compression.metrics.endpoints.some((item: { label: string }) => item.label === "POST /v1/responses"), true);
    const compressionProject = compression.metrics.projects.find((item: { id: string }) => item.id === "project-alpha/client");
    assert.equal(compressionProject.inputTokens, 22);
    assert.equal(compressionProject.outputTokens, 14);
    assert.equal(compression.requestGroups.length, 1);
    assert.equal(compression.requestGroups[0].requests, 2);
    assert.equal(compression.requestGroups[0].endpoint, "POST /v1/responses");
    assert.equal(compression.requestGroups[0].project, "project-alpha/client");
    assert.equal(compression.requestGroups[0].keyId, issued.view.id);
    assert.equal(compression.requests.length, 2);
    assert.equal(compression.latest.requestId, latest.requestId);
    assert.equal(compression.requests.at(-1).requestId, latest.requestId);
    assert.doesNotMatch(JSON.stringify(compression), /super-secret|favicon-secret|api_key=|chrome\.devtools/);

  } finally {
    if (proxy) await proxy.close();
    identity.close();
    await close(upstream);
    await rm(dir, { recursive: true, force: true });
  }
});

test("unknown plugin data routes return not found", async () => {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-plugin-missing-"));
  try {
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const cookie = await setupAdmin(base);
    const response = await fetch(`${base}/__molenkopf/plugins/missing/data`, { headers: { cookie } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "plugin_not_found" });
  } finally {
    if (proxy) await proxy.close();
    await close(upstream);
    await rm(dir, { recursive: true, force: true });
  }
});

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function setupAdmin(base: string): Promise<string> {
  const setup = await fetch(`${base}/__molenkopf/setup-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin-secret" })
  });
  return (setup.headers.get("set-cookie") ?? "").split(";")[0];
}
