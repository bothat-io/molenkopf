import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";
import type { User } from "../../core/src/identity/types.ts";
import { auth, issueKey } from "./proxy-auth-utils.ts";

function usageUpstream(label: string, hits: { [k: string]: number }): Server {
  return createServer((req, res) => {
    hits[label] = (hits[label] ?? 0) + 1;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ label, usage: { input_tokens: 1000, output_tokens: 500 } }));
  });
}

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

async function post(base: string, path: string, body: unknown, cookie = "") {
  return fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

async function pollJson(url: string, predicate: (v: any) => boolean, attempts = 60, cookie = ""): Promise<any> {
  const init = cookie ? { headers: { cookie } } : undefined;
  for (let i = 0; i < attempts; i++) {
    const value = await fetch(url, init).then((r) => r.json());
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  return fetch(url, init).then((r) => r.json());
}

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const setupAdmin = (base: string) => post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }).then(cookieOf);

test("distribute mode spreads load across providers by weight", async () => {
  const hits: { [k: string]: number } = {};
  const primary = usageUpstream("primary", hits);
  const backup = usageUpstream("backup", hits);
  const primaryPort = await listenOn(primary);
  const backupPort = await listenOn(backup);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-dist-"));
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${primaryPort}/v1`,
    providers: [
      { id: "primary", name: "Primary", kind: "local", target: `http://127.0.0.1:${primaryPort}/v1` },
      { id: "backup", name: "Backup", kind: "local", target: `http://127.0.0.1:${backupPort}/v1` }
    ],
    activeProviderId: "primary",
    providerCatalogMode: "explicit",
    dataDir: dir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "distribution");
    await post(base, "/__molenkopf/routing/mode", { mode: "distribute" }, admin);
    for (let i = 0; i < 4; i++) {
      await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" }).then((r) => r.text());
      await pollJson(`${base}/__molenkopf/stats`, (s) => s.requests >= i + 1, 60, admin);
    }
    assert.ok((hits.primary ?? 0) >= 1, "primary provider received traffic");
    assert.ok((hits.backup ?? 0) >= 1, "backup provider received traffic");
    assert.equal((hits.primary ?? 0) + (hits.backup ?? 0), 4);
  } finally {
    await proxy.close();
    primary.close();
    backup.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("distribute mode only chooses providers allowed by the API key team", async () => {
  const hits: { [k: string]: number } = {};
  const primary = usageUpstream("primary", hits);
  const backup = usageUpstream("backup", hits);
  const primaryPort = await listenOn(primary);
  const backupPort = await listenOn(backup);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-dist-policy-"));
  const seed = new IdentityStore(dir);
  await seed.load();
  const bob: User = { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" };
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: ["backup"], managerIds: [], createdAt: "x" });
  await seed.putUser(bob);
  const key = (await issueApiKey(seed, "bob", { agentLabel: "worker", project: "project-alpha", teamId: "alpha" }))!;
  seed.close();
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${primaryPort}/v1`,
    providers: [{ id: "backup", name: "Backup", kind: "local", target: `http://127.0.0.1:${backupPort}/v1` }],
    providerCatalogMode: "explicit",
    dataDir: dir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    await post(base, "/__molenkopf/routing/mode", { mode: "distribute" }, admin);
    const response = await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key.secret}` }, body: "{}" });
    assert.equal(response.status, 200);
    assert.equal(hits.backup, 1);
    assert.equal(hits.primary ?? 0, 0);
  } finally {
    await proxy.close();
    primary.close();
    backup.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("distribute mode fails closed when no provider is allowed for the API key team", async () => {
  const hits: { [k: string]: number } = {};
  const primary = usageUpstream("primary", hits);
  const backup = usageUpstream("backup", hits);
  const primaryPort = await listenOn(primary);
  const backupPort = await listenOn(backup);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-dist-denied-"));
  const seed = new IdentityStore(dir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: ["missing"], managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  const key = (await issueApiKey(seed, "bob", { agentLabel: "worker", project: "project-alpha", teamId: "alpha" }))!;
  seed.close();
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${primaryPort}/v1`,
    providers: [{ id: "backup", name: "Backup", kind: "local", target: `http://127.0.0.1:${backupPort}/v1` }],
    providerCatalogMode: "explicit",
    dataDir: dir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    await post(base, "/__molenkopf/routing/mode", { mode: "distribute" }, admin);
    const response = await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key.secret}` }, body: "{}" });
    assert.equal(response.status, 409);
    assert.equal(hits.primary ?? 0, 0);
    assert.equal(hits.backup ?? 0, 0);
  } finally {
    await proxy.close();
    primary.close();
    backup.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("agent token limit returns 429 once exceeded; disabled agent returns 403", async () => {
  const hits: { [k: string]: number } = {};
  const upstream = usageUpstream("u", hits);
  const upstreamPort = await listenOn(upstream);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-limit-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "agent-limit");
    await post(base, "/__molenkopf/agents/draft", { id: "limited", providerId: "default", tokenLimit: 1500 }, admin);
    const first = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json", "x-molenkopf-agent": "limited" }), body: "{}" });
    await first.text();
    assert.equal(first.status, 200);
    // wait until the 1500 tokens from the first request are accounted
    await pollJson(`${base}/__molenkopf/agents`, (a) => (a.items.find((i: any) => i.id === "limited")?.usage.inputTokens ?? 0) >= 1000, 60, admin);
    const second = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json", "x-molenkopf-agent": "limited" }), body: "{}" });
    assert.equal(second.status, 429);

    await post(base, "/__molenkopf/agents/draft", { id: "off", providerId: "default", disabled: true }, admin);
    const blocked = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json", "x-molenkopf-agent": "off" }), body: "{}" });
    assert.equal(blocked.status, 403);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
