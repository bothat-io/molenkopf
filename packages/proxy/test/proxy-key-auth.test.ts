import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey, revokeKey } from "../../core/src/identity/api-keys.ts";
import type { User } from "../../core/src/identity/types.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

test("proxy authenticates by Molenkopf API key, attributes to user, never leaks the key upstream", async () => {
  let lastAuth: string | undefined;
  const upstream = createServer((req, res) => {
    lastAuth = req.headers.authorization;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ usage: { input_tokens: 5, output_tokens: 7 } }));
  });
  const upstreamPort = await listenOn(upstream);

  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-proxyauth-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  const bob: User = { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "2026-06-21T00:00:00.000Z" };
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "2026-06-21T00:00:00.000Z" });
  await seed.putUser(bob);
  const issued = (await issueApiKey(seed, "bob", { agentLabel: "ci-bot", project: "project-alpha", teamId: "alpha" }))!;
  seed.close();

  process.env.MOLENKOPF_REQUIRE_KEY = "1";
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);

    assert.equal((await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401, "no key -> 401");
    assert.equal((await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mk_bogus" }, body: "{}" })).status, 401, "invalid key -> 401");

    const ok = await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.secret}` }, body: "{}" });
    assert.equal(ok.status, 200, "valid key -> 200");
    assert.equal(lastAuth, undefined, "Molenkopf key is stripped, never forwarded upstream");

    let attributed = false;
    for (let i = 0; i < 20 && !attributed; i++) {
      const consumers = await fetch(`${base}/__molenkopf/consumers`, { headers: { cookie: admin } }).then((r) => r.json());
      attributed = consumers.items.some((c: any) => c.id === "user:bob");
      if (!attributed) await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(attributed, "request attributed to user:bob");
    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(usage.teams.find((t: any) => t.id === "alpha").usage.requests, 1);
  } finally {
    delete process.env.MOLENKOPF_REQUIRE_KEY;
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("API key provider scopes block forbidden provider selection", async () => {
  const hits: Record<string, number> = {};
  const primary = countingUpstream("default", hits);
  const backup = countingUpstream("backup", hits);
  const primaryPort = await listenOn(primary);
  const backupPort = await listenOn(backup);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-keyscope-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  const bob: User = { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "2026-06-21T00:00:00.000Z" };
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "2026-06-21T00:00:00.000Z" });
  await seed.putUser(bob);
  const issued = (await issueApiKey(seed, "bob", { agentLabel: "scoped", project: "project-alpha", teamId: "alpha", scopes: ["default"] }))!;
  process.env.MOLENKOPF_REQUIRE_KEY = "1";
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${primaryPort}/v1`,
      providers: [{ id: "backup", name: "Backup", kind: "local", target: `http://127.0.0.1:${backupPort}/v1` }],
      activeProviderId: "backup",
      dataDir
    });
    const blocked = await authedPost(proxy.port, issued.secret);
    assert.equal(blocked.status, 403);
    await proxy.close();
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${primaryPort}/v1`,
      providers: [{ id: "backup", name: "Backup", kind: "local", target: `http://127.0.0.1:${backupPort}/v1` }],
      dataDir
    });
    const ok = await authedPost(proxy.port, issued.secret);
    assert.equal(ok.status, 200);
    assert.equal(hits.default, 1);
    assert.equal(hits.backup ?? 0, 0);
  } finally {
    delete process.env.MOLENKOPF_REQUIRE_KEY;
    if (proxy) await proxy.close().catch(() => {});
    primary.close();
    backup.close();
  }
});

test("invalid revoked and disabled-owner Molenkopf keys never fall back upstream", async () => {
  const hits: Record<string, number> = {};
  const upstream = countingUpstream("upstream", hits);
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-key-edge-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  await seed.putUser({ id: "dana", displayName: "Dana", role: "member", teamIds: ["alpha"], createdAt: "x" });
  const revoked = (await issueApiKey(seed, "bob", { project: "project-alpha", teamId: "alpha" }))!;
  const disabledOwner = (await issueApiKey(seed, "dana", { project: "project-alpha", teamId: "alpha" }))!;
  await revokeKey(seed, revoked.view.id);
  seed.getUser("dana")!.disabled = true;
  await seed.save();
  seed.close();
  const previousRequireKey = process.env.MOLENKOPF_REQUIRE_KEY;
  delete process.env.MOLENKOPF_REQUIRE_KEY;
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    assert.equal((await authedPost(proxy.port, "mk_bogus")).status, 401);
    assert.equal((await authedPost(proxy.port, revoked.secret)).status, 401);
    assert.equal((await authedPost(proxy.port, disabledOwner.secret)).status, 401);
    assert.equal(hits.upstream ?? 0, 0);
  } finally {
    if (previousRequireKey === undefined) delete process.env.MOLENKOPF_REQUIRE_KEY; else process.env.MOLENKOPF_REQUIRE_KEY = previousRequireKey;
    if (proxy) await proxy.close().catch(() => {});
    upstream.close();
  }
});

function countingUpstream(label: string, hits: Record<string, number>): Server {
  return createServer((req, res) => {
    hits[label] = (hits[label] ?? 0) + 1;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
}

function authedPost(port: number, secret: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: "{}" });
}

async function setupAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
