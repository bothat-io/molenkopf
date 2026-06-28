import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staticPluginPipeline } from "../../core/src/plugins/static-pipeline.ts";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey, localAuth } from "./proxy-auth-utils.ts";

test("proxy forwards OpenAI paths, rewrites long body strings, audits, and exposes stats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-e2e-"));
  let upstreamBody = "";
  let upstreamAuth = "";
  const upstream = createServer((req, res) => {
    upstreamAuth = req.headers.authorization ?? "";
    req.on("data", (chunk) => upstreamBody += chunk);
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir, providerCatalogMode: "explicit",
      providers: [{ id: "local-upstream", name: "Local upstream", kind: "local", target: `http://127.0.0.1:${upstreamPort}/v1`, authScheme: "none", allowClientCredentialForwarding: true }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "proxy-e2e");
    // Compression is opt-in (transparent by default); enable it to assert body rewriting.
    await postJson(`${base}/__molenkopf/plugins/toggle`, { id: "context-compressor-plugin", enabled: true }, admin);
    const longLog = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR done";
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: localAuth(key, { authorization: "Bearer secret", "content-type": "application/json", connection: "close" }),
      body: JSON.stringify({ input: longLog })
    });
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(upstreamAuth, "Bearer secret");
    assert.match(upstreamBody, /molenkopf compressed/);
    // Streaming sends the response before the audit write completes, so poll the in-memory counter.
    const stats = await pollJson(`${base}/__molenkopf/stats`, (s) => s.requests === 1, 50, admin);
    assert.equal(stats.requests, 1);
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(latest.path, "/v1/responses");
    assert.doesNotMatch(JSON.stringify(latest), /Bearer secret|line 200/);
  } finally {
    if (proxy) await proxy.close();
    await close(upstream);
    await rm(dir, { recursive: true, force: true });
  }
});

test("local roadmap endpoints expose status, plugins, config, and dashboard entry", async () => {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-roadmap-"));
  try {
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir, providerCatalogMode: "explicit",
      providers: [{ id: "local-upstream", name: "Local upstream", kind: "local", target: `http://127.0.0.1:${upstreamPort}/v1`, authScheme: "none" }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);

    const status = await fetch(`${base}/__molenkopf/status`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(status.ok, true);
    assert.equal(status.targetHost, `127.0.0.1:${upstreamPort}`);
    assert.deepEqual(status.pipeline, staticPluginPipeline);

    const plugins = await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.deepEqual(plugins.staticPipeline.map((item: { name: string }) => item.name), staticPluginPipeline);
    assert.deepEqual(plugins.items.map((item: { id: string }) => item.id).sort(), ["context-compressor-plugin", "obsidian-graph-plugin", "project-graph-plugin", "token-optimizer-plugin"]);
    assert.equal(plugins.remotePlugins.enabled, false);

    const config = await fetch(`${base}/__molenkopf/config`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(config.target, `http://127.0.0.1:${upstreamPort}/v1`);
    assert.equal(config.remotePluginLoading, false);
    assert.equal(config.agentAccess.providerBinding, "provider profile per agent");

    const root = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/__molenkopf/dashboard");
  } finally {
    if (proxy) await proxy.close();
    await close(upstream);
    await rm(dir, { recursive: true, force: true });
  }
});

test("plugin hub exposes pages and live toggles compression behavior", async () => {
  let upstreamBody = "";
  const upstream = createServer((req, res) => {
    req.on("data", (chunk) => upstreamBody += chunk);
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-plugin-hub-"));
  try {
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir, providerCatalogMode: "explicit",
      providers: [{ id: "local-upstream", name: "Local upstream", kind: "local", target: `http://127.0.0.1:${upstreamPort}/v1`, authScheme: "none" }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "plugin-hub");

    const plugins = await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: admin } }).then((r) => r.json());
    const compressor = plugins.items.find((item: { id: string }) => item.id === "context-compressor-plugin");
    const obsidian = plugins.items.find((item: { id: string }) => item.id === "obsidian-graph-plugin");
    const optimizer = plugins.items.find((item: { id: string }) => item.id === "token-optimizer-plugin");
    // Transparent by default: compression is opt-in, so it starts disabled.
    assert.equal(compressor.enabled, false);
    assert.equal(compressor.canToggle, true);
    assert.equal(compressor.pagePath, "/__molenkopf/plugins/context-compressor-plugin/page");
    assert.equal(obsidian.enabled, true);
    assert.equal(optimizer.enabled, true);

    const page = await fetch(`${base}${compressor.pagePath}`, { headers: { cookie: admin } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Context compression/);

    const coreToggle = await fetch(`${base}/__molenkopf/plugins/toggle`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ id: "core-redaction", enabled: false })
    });
    assert.equal(coreToggle.status, 404);

    const longLog = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR visible";
    // Default (disabled): the body passes through untouched.
    upstreamBody = "";
    await fetch(`${base}/v1/responses`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ input: longLog }) });
    assert.doesNotMatch(upstreamBody, /molenkopf compressed/);
    assert.match(upstreamBody, /line 200/);

    // Enabled: compression rewrites the long body.
    const enabled = await postJson(`${base}/__molenkopf/plugins/toggle`, { id: "context-compressor-plugin", enabled: true }, admin);
    assert.equal(enabled.enabled, true);
    upstreamBody = "";
    await fetch(`${base}/v1/responses`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ input: longLog }) });
    assert.match(upstreamBody, /molenkopf compressed/);
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
  const response = await postJson(`${base}/__molenkopf/setup-admin`, { username: "admin", password: "admin-secret" });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function postJson(url: string, body: unknown, cookie = "") {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  if (url.endsWith("/setup-admin")) return response;
  return response.json();
}

async function pollJson(url: string, predicate: (value: any) => boolean, attempts = 50, cookie = ""): Promise<any> {
  const init = cookie ? { headers: { cookie } } : undefined;
  for (let i = 0; i < attempts; i++) {
    const value = await fetch(url, init).then((r) => r.json());
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return fetch(url, init).then((r) => r.json());
}
