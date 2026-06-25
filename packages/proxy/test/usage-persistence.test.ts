import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";
import { AuditStore } from "../../core/src/manifest/audit-store.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
async function consumers(base: string, cookie: string) {
  return fetch(`${base}/__molenkopf/consumers`, { headers: { cookie } }).then((r) => r.json());
}

test("usage + euro cost persist across a restart", async () => {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ usage: { input_tokens: 5, output_tokens: 7 } }));
  });
  const upstreamPort = await listenOn(upstream);

  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-usage-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  seed.data.pricing = { default: { inPerMTok: 1000, outPerMTok: 2000 } };
  await seed.save();
  const issued = (await issueApiKey(seed, "bob", { project: "project-alpha" }))!;
  seed.close();

  const target = `http://127.0.0.1:${upstreamPort}/v1`;
  let first;
  try {
    first = await startProxy({ port: 0, target, dataDir });
    const base = `http://127.0.0.1:${first.port}`;
    const admin = await setupAdmin(base);
    await fetch(`${base}/v1/m`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.secret}` }, body: "{}" }).then((r) => r.text());
    for (let i = 0; i < 40; i++) {
      const c = await consumers(base, admin);
      if (c.items.some((x: any) => x.id === "user:bob" && x.usage.inputTokens === 5)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
  } finally {
    if (first) await first.close(); // flushes the snapshot
  }
  upstream.close();

  // restart on the same data dir; numbers must be restored with NO new request
  const second = await startProxy({ port: 0, target, dataDir });
  try {
    const base = `http://127.0.0.1:${second.port}`;
    const admin = await loginAdmin(base);
    const c = await consumers(base, admin);
    const bob = c.items.find((x: any) => x.id === "user:bob");
    assert.ok(bob, "user:bob restored after restart");
    assert.equal(bob.usage.inputTokens, 5);
    assert.equal(bob.usage.outputTokens, 7);
    // cost = 5/1e6*1000 + 7/1e6*2000 = 0.019 €
    assert.ok(Math.abs(bob.usage.costEur - 0.019) < 1e-9, `euro cost restored, got ${bob.usage.costEur}`);
  } finally {
    await second.close();
  }
});

test("missing usage snapshot rebuilds from audit manifests", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-usage-rebuild-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  seed.data.keys.key_a = { id: "key_a", hash: "h", prefix: "mk_fake", ownerUserId: "bob", teamId: "alpha", project: "project-alpha", createdAt: "x" };
  await seed.save();
  seed.close();
  await new AuditStore(dataDir).write({
    requestId: "rebuild-1", timestamp: "2026-06-23T00:00:00.000Z", method: "POST", path: "/v1/messages", targetHost: "api.test", providerId: "default",
    client: { id: "user:bob", label: "Bob", source: "api_key", userId: "bob", teamIds: ["alpha"], keyId: "key_a", project: "project-alpha" },
    compressedItems: 1, estimatedOriginalTokens: 100, estimatedCompressedTokens: 25, estimatedSavedTokens: 0,
    redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [], statusCode: 200, durationMs: 1,
    upstreamInputTokens: 5, upstreamOutputTokens: 7
  });

  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(usage.users.find((x: any) => x.id === "bob").usage.inputTokens, 5);
    assert.equal(usage.keys.find((x: any) => x.id === "key_a").usage.outputTokens, 7);
    assert.equal("savedTokens" in usage.teams.find((x: any) => x.id === "alpha").usage, false);
  } finally {
    await proxy.close();
    upstream.close();
  }
});

async function setupAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/setup-admin`, { username: "admin", password: "admin-secret" });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

async function loginAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/login`, { username: "admin", password: "admin-secret" });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function sessionCookie(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
