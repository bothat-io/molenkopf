import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { providerHttpTest } from "../src/http/provider-http-test.ts";

type Hit = { method?: string; url?: string; auth?: string; apiKey?: string; cookie?: string; body: string };

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

test("provider test probes OpenAI-compatible HTTP providers without selecting them", async () => {
  const hits: Hit[] = [];
  const upstream = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      hits.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  const port = await listen(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-http-"));
  const proxy = await startProxy({
    port: 0,
    target: "http://127.0.0.1:1/v1",
    providers: [{ id: "openai-test", name: "OpenAI Test", kind: "local", target: `http://127.0.0.1:${port}/v1`, credentialValue: "sk-test", credentialRef: "inline", authScheme: "bearer", protocol: "openai-responses" }],
    dataDir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const result = await post(base, "/__molenkopf/providers/test", { id: "openai-test" }, admin).then((r) => r.json());
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());

    assert.equal(result.http.path, "/responses");
    assert.equal(result.model.status, "ok");
    assert.equal(hits[0].url, "/v1/responses");
    assert.equal(hits[0].auth, "Bearer sk-test");
    assert.match(hits[0].body, /Reply OK/);
    assert.equal(providers.activeProvider.id, "default");
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("provider test probes Ollama through tags without auth or body", async () => {
  const hits: Hit[] = [];
  const upstream = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      hits.push({ method: req.method, url: req.url, auth: req.headers.authorization, apiKey: req.headers["x-api-key"] as string, cookie: req.headers.cookie, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{\"models\":[]}");
    });
  });
  const port = await listen(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-ollama-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    await post(base, "/__molenkopf/providers/add", { id: "ollama-dev", kind: "ollama", target: `http://127.0.0.1:${port}/v1` }, admin);
    const result = await post(base, "/__molenkopf/providers/test", { id: "ollama-dev" }, admin).then((r) => r.json());

    assert.equal(result.http.path, "/api/tags");
    assert.equal(result.model.status, "ok");
    assert.deepEqual(hits[0], { method: "GET", url: "/api/tags", auth: undefined, apiKey: undefined, cookie: undefined, body: "" });
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("provider test does not fetch when required credentials are missing", async () => {
  let hits = 0;
  const upstream = createServer((_req, res) => { hits += 1; res.writeHead(200, {}); res.end("{}"); });
  const port = await listen(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-missing-key-"));
  const proxy = await startProxy({
    port: 0,
    target: "http://127.0.0.1:1/v1",
    providers: [{ id: "needs-key", name: "Needs key", kind: "local", target: `http://127.0.0.1:${port}/v1`, credentialEnv: "MISSING_KEY", authScheme: "bearer", protocol: "openai-responses" }],
    activeProviderId: "needs-key",
    providerCatalogMode: "explicit",
    dataDir
  });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const result = await post(base, "/__molenkopf/providers/test", { id: "needs-key" }, admin).then((r) => r.json());
    assert.equal(result.auth.status, "missing");
    assert.equal(hits, 0);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("providerHttpTest uses pinned Node HTTP instead of global fetch", async () => {
  const upstream = createServer((_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  const port = await listen(upstream);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("global fetch must not be used"); }) as typeof fetch;
  try {
    const result = await providerHttpTest({ id: "pinned", name: "Pinned", kind: "local", target: `http://127.0.0.1:${port}/v1`, authScheme: "none", protocol: "openai-chat" });
    assert.equal(result.model.status, "ok");
  } finally {
    globalThis.fetch = originalFetch;
    upstream.close();
  }
});

async function setupAdmin(base: string): Promise<string> {
  const res = await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

function post(base: string, path: string, body: unknown, cookie = ""): Promise<Response> {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}
