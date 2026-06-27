import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { cookieOf, issueKey, localAuth } from "./proxy-auth-utils.ts";

test("selected env provider injects configured credential without leaking client auth", async () => {
  let upstreamAuth = "";
  let upstreamApiKey = "";
  let upstreamCookie = "";
  const upstream = createServer((req, res) => {
    upstreamAuth = req.headers.authorization ?? "";
    upstreamApiKey = String(req.headers["x-api-key"] ?? "");
    upstreamCookie = req.headers.cookie ?? "";
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  const credentialEnv = uniqueEnv("FORWARDING");
  process.env[credentialEnv] = "server-profile-secret";
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-cred-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await listen(upstream);
    const port = (upstream.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${port}/v1`,
      activeProviderId: "team-openai",
      providerCatalogMode: "explicit",
      dataDir: dir,
      providers: [{ id: "team-openai", name: "Team OpenAI", kind: "local", target: `http://127.0.0.1:${port}/v1`, credentialEnv, authScheme: "bearer" }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await setupAdmin(base));
    const key = await issueKey(base, admin, "forwarding");
    await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: localAuth(key, { authorization: "Bearer client-secret", cookie: "sid=1", "x-api-key": "client-key" }),
      body: "{}"
    });

    assert.equal(upstreamAuth, "Bearer server-profile-secret");
    assert.equal(upstreamApiKey, "");
    assert.equal(upstreamCookie, "");
  } finally {
    delete process.env[credentialEnv];
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
    await close(upstream);
  }
});

test("absolute request targets are rejected before provider credentials can leak", async () => {
  let upstreamHits = 0;
  let attackerHits = 0;
  let attackerAuth = "";
  const upstream = createServer((req, res) => {
    upstreamHits++;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  const attacker = createServer((req, res) => {
    attackerHits++;
    attackerAuth = req.headers.authorization ?? "";
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  const credentialEnv = uniqueEnv("ABSOLUTE");
  process.env[credentialEnv] = "server-profile-secret";
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-cred-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await listen(upstream);
    await listen(attacker);
    const upstreamPort = (upstream.address() as { port: number }).port;
    const attackerPort = (attacker.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${upstreamPort}/v1`,
      activeProviderId: "team-openai",
      providerCatalogMode: "explicit",
      dataDir: dir,
      providers: [{ id: "team-openai", name: "Team OpenAI", kind: "local", target: `http://127.0.0.1:${upstreamPort}/v1`, credentialEnv, authScheme: "bearer" }]
    });
    const admin = cookieOf(await setupAdmin(`http://127.0.0.1:${proxy.port}`));
    const key = await issueKey(`http://127.0.0.1:${proxy.port}`, admin, "absolute-target");
    const response = await rawProxyRequest(proxy.port, `http://127.0.0.1:${attackerPort}/steal`, key);
    const schemeRelative = await rawProxyRequest(proxy.port, `//127.0.0.1:${attackerPort}/steal`, key);

    assert.equal(response.status, 502);
    assert.equal(schemeRelative.status, 502);
    assert.equal(upstreamHits, 0);
    assert.equal(attackerHits, 0);
    assert.equal(attackerAuth, "");
  } finally {
    delete process.env[credentialEnv];
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
    await close(upstream);
    await close(attacker);
  }
});

test("selected provider with missing credential fails locally", async () => {
  let upstreamHits = 0;
  const upstream = createServer((req, res) => {
    upstreamHits++;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-cred-"));
  try {
    await listen(upstream);
    const port = (upstream.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${port}/v1`,
      activeProviderId: "team-openai",
      providerCatalogMode: "explicit",
      dataDir: dir,
      providers: [{ id: "team-openai", name: "Team OpenAI", kind: "local", target: `http://127.0.0.1:${port}/v1`, credentialEnv: uniqueEnv("MISSING"), authScheme: "bearer" }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await setupAdmin(base));
    const key = await issueKey(base, admin, "missing-credential");
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: localAuth(key, { authorization: "Bearer client-secret" }), body: "{}" });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "missing_provider_credential" });
    assert.equal(upstreamHits, 0);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
    await close(upstream);
  }
});

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function uniqueEnv(label: string): string {
  return `MOLENKOPF_TEST_${label}_${process.pid}_${Math.random().toString(16).slice(2).toUpperCase()}`;
}

function rawProxyRequest(port: number, path: string, key: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "POST", path, headers: { "content-type": "application/json", "x-molenkopf-token": key } }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += String(chunk); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end("{}");
  });
}

function setupAdmin(base: string): Promise<Response> {
  return fetch(`${base}/__molenkopf/setup-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin-secret" })
  });
}
