import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { resolveRouting } from "../src/http/agent-router.ts";
import { createRuntimeState } from "../src/http/runtime-state.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";
import type { User } from "../../core/src/identity/types.ts";
const anonymousClient = { id: "anonymous", label: "unattributed client", source: "anonymous" as const };
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
function countingUpstream(label: string, hits: { [k: string]: number }): Server {
  return createServer((req, res) => {
    hits[label] = (hits[label] ?? 0) + 1;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, label }));
  });
}
function usageUpstream(input: number, output: number): Server {
  return createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ usage: { input_tokens: input, output_tokens: output } }));
  });
}
async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
test("routes each agent to its bound provider via x-molenkopf-agent", async () => {
  const hits: { [k: string]: number } = {};
  const primary = countingUpstream("primary", hits);
  const backup = countingUpstream("backup", hits);
  const primaryPort = await listenOn(primary);
  const backupPort = await listenOn(backup);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-agent-bind-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  const betaKey = (await issueApiKey(seed, "bob", { agentLabel: "beta", project: "project-alpha", teamId: "alpha" }))!;
  const alphaKey = (await issueApiKey(seed, "bob", { agentLabel: "alpha", project: "project-alpha", teamId: "alpha" }))!;
  seed.close();
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${primaryPort}/v1`,
    providers: [{ id: "backup", name: "Backup", kind: "local", target: `http://127.0.0.1:${backupPort}/v1` }],
    configAgents: [{ id: "beta", providerId: "backup" }, { id: "alpha", providerId: "default" }],
    dataDir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    await fetch(`${base}/v1/responses`, { method: "POST", headers: { authorization: `Bearer ${betaKey.secret}`, "x-molenkopf-agent": "beta" }, body: "{}" });
    await fetch(`${base}/v1/responses`, { method: "POST", headers: { authorization: `Bearer ${alphaKey.secret}`, "x-molenkopf-agent": "alpha" }, body: "{}" });
    await fetch(`${base}/v1/responses`, { method: "POST", body: "{}" }); // no agent -> global default
    assert.equal(hits.backup, 1, "agent beta routes to backup");
    assert.equal(hits.primary, 2, "agent alpha + unattributed route to default");
  } finally {
    await proxy.close();
    primary.close();
    backup.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
test("disabled pinned agent providers fail closed instead of falling back", () => {
  const state = createRuntimeState({
    target: "http://127.0.0.1:1/v1",
    providers: [{ id: "backup", name: "Backup", kind: "local", target: "http://127.0.0.1:2/v1", enabled: false }],
    configAgents: [{ id: "beta", providerId: "backup" }]
  }, "127.0.0.1");
  const routed = resolveRouting(state, new Headers({ "x-molenkopf-agent": "beta" }), { ...anonymousClient, source: "api_key", keyAgentLabel: "beta" });
  assert.equal(routed.ok, false);
  if (!routed.ok) assert.equal(routed.error, "provider_unavailable");
});

test("distribution includes CLI providers only when explicitly enabled", () => {
  const state = createRuntimeState({
    target: "http://127.0.0.1:1/v1",
    providerCatalogMode: "explicit",
    providers: [{ id: "cli-account", name: "CLI", kind: "cli", target: "cli://cli-account", runtime: "claude", cliCommand: "claude", authScheme: "none" }]
  }, "127.0.0.1");
  state.routingMode = "distribute";
  let routed = resolveRouting(state, new Headers(), anonymousClient);
  assert.equal(routed.ok, false);
  if (!routed.ok) assert.equal(routed.error, "no_eligible_provider");

  state.providers[0].allowDistribution = true;
  routed = resolveRouting(state, new Headers(), anonymousClient);
  assert.equal(routed.ok, true);
  if (routed.ok) assert.equal(routed.provider.id, "cli-account");
});

test("provider project fields are ignored because projects live on API keys", () => {
  const state = createRuntimeState({
    target: "http://127.0.0.1:1/v1",
    providerCatalogMode: "explicit",
    providers: [{ id: "claude-prod", name: "Claude Prod", kind: "api", target: "http://127.0.0.1:2/v1", allowedProjects: ["client-a"], blockedProjects: ["client-b"] } as any]
  }, "127.0.0.1");
  const allowed = resolveRouting(state, new Headers(), { ...anonymousClient, project: "client-a" });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.provider.id, "claude-prod");

  const missing = resolveRouting(state, new Headers(), { ...anonymousClient, project: "client-c" });
  assert.equal(missing.ok, true);

  const blocked = resolveRouting(state, new Headers(), { ...anonymousClient, project: "client-b" });
  assert.equal(blocked.ok, true);
});

test("team provider allowlists block pinned agent routes", async () => {
  const hits: { [k: string]: number } = {};
  const primary = countingUpstream("primary", hits);
  const backup = countingUpstream("backup", hits);
  const primaryPort = await listenOn(primary);
  const backupPort = await listenOn(backup);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-pinned-policy-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  const bob: User = { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" };
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: ["default"], managerIds: [], createdAt: "x" });
  await seed.putUser(bob);
  const betaKey = (await issueApiKey(seed, "bob", { agentLabel: "beta", project: "project-alpha", teamId: "alpha" }))!;
  const alphaKey = (await issueApiKey(seed, "bob", { agentLabel: "alpha", project: "project-alpha", teamId: "alpha" }))!;
  seed.close();
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${primaryPort}/v1`,
    providers: [{ id: "backup", name: "Backup", kind: "api", target: `http://127.0.0.1:${backupPort}/v1` }],
    configAgents: [{ id: "beta", providerId: "backup" }, { id: "alpha", providerId: "default" }],
    dataDir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const denied = await fetch(`${base}/v1/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${betaKey.secret}`, "x-molenkopf-agent": "beta" }, body: "{}" });
    assert.equal(denied.status, 403);
    const allowed = await fetch(`${base}/v1/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${alphaKey.secret}`, "x-molenkopf-agent": "alpha" }, body: "{}" });
    assert.equal(allowed.status, 200);
    assert.equal(hits.primary, 1);
    assert.equal(hits.backup ?? 0, 0);
  } finally {
    await proxy.close();
    primary.close();
    backup.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("API key owner and logical agent usage are tracked separately", async () => {
  const upstream = usageUpstream(3, 4);
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-agent-usage-"));
  const seed = new IdentityStore(dataDir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  const key = (await issueApiKey(seed, "bob", { agentLabel: "ci", project: "project-alpha", teamId: "alpha" }))!;
  seed.close();
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const ok = await fetch(`${base}/v1/responses`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key.secret}`, "x-molenkopf-agent": "build" }, body: "{}" });
    assert.equal(ok.status, 200);
    let consumers: any;
    for (let i = 0; i < 40; i++) {
      consumers = await fetch(`${base}/__molenkopf/consumers`, { headers: { cookie: admin } }).then((r) => r.json());
      const user = consumers.items.find((x: any) => x.id === "user:bob");
      const agent = consumers.items.find((x: any) => x.id === "agent:build");
      if (user?.usage.inputTokens === 3 && agent?.usage.inputTokens === 3) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(consumers.items.find((x: any) => x.id === "agent:build").usage.outputTokens, 4);
    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(usage.users.find((x: any) => x.id === "bob").usage.requests, 1);
    assert.equal(usage.keys.find((x: any) => x.id === key.view.id).usage.requests, 1);
    assert.equal(usage.teams.find((x: any) => x.id === "alpha").usage.requests, 1);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
