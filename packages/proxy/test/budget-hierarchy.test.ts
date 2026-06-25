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
import { checkBudgets } from "../src/http/budget-gate.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const setupAdmin = (base: string) => fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }).then(cookieOf);
function upstreamWithTokens(input: number, output: number): Server {
  return createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ usage: { input_tokens: input, output_tokens: output } }));
  });
}
async function waitForUser(base: string, cookie: string, id: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const c = await fetch(`${base}/__molenkopf/consumers`, { headers: { cookie } }).then((r) => r.json());
    if (c.items.some((x: any) => x.id === id && x.usage.inputTokens + x.usage.outputTokens > 0)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}
async function waitForKeyCost(base: string, cookie: string, keyId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie } }).then((r) => r.json());
    if ((usage.keys.find((x: any) => x.id === keyId)?.usage.costEur ?? 0) >= 1) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}
async function waitForLatestWarning(base: string, cookie: string, text: string): Promise<any> {
  for (let i = 0; i < 40; i++) {
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((r) => r.json());
    if (latest.warnings?.some((warning: string) => warning.includes(text))) return latest;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((r) => r.json());
}

test("team budget blocks with 429 + Retry-After after it is spent", async () => {
  const upstream = upstreamWithTokens(5, 7); // 12 tokens per request
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-budget-"));
  const s = new IdentityStore(dataDir);
  await s.load();
  await s.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x", budget: { tokenLimit: 5, period: "total", onExceed: "block" } });
  await s.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha" }))!;
  s.close();

  process.env.MOLENKOPF_REQUIRE_KEY = "1";
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const headers = { "content-type": "application/json", authorization: `Bearer ${issued.secret}` };

    assert.equal((await fetch(`${base}/v1/m`, { method: "POST", headers, body: "{}" })).status, 200, "first request under budget");
    await waitForUser(base, admin, "user:bob");
    const blocked = await fetch(`${base}/v1/m`, { method: "POST", headers, body: "{}" });
    assert.equal(blocked.status, 429, "team budget spent -> 429");
    assert.equal(blocked.headers.get("retry-after"), "60");
    const body = await blocked.json();
    assert.equal(body.tier, "team");
    assert.equal(body.error, "budget_exceeded_team");
  } finally {
    delete process.env.MOLENKOPF_REQUIRE_KEY;
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("warn budget never blocks", async () => {
  const upstream = upstreamWithTokens(50, 50);
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-budget-warn-"));
  const s = new IdentityStore(dataDir);
  await s.load();
  await s.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await s.putUser({ id: "ann", displayName: "Ann", role: "member", teamIds: ["alpha"], createdAt: "x", budget: { tokenLimit: 1, period: "total", onExceed: "warn" } });
  const issued = (await issueApiKey(s, "ann", { project: "project-alpha" }))!;
  s.close();

  process.env.MOLENKOPF_REQUIRE_KEY = "1";
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const headers = { "content-type": "application/json", authorization: `Bearer ${issued.secret}` };
    assert.equal((await fetch(`${base}/v1/m`, { method: "POST", headers, body: "{}" })).status, 200);
    await waitForUser(base, admin, "user:ann");
    assert.equal((await fetch(`${base}/v1/m`, { method: "POST", headers, body: "{}" })).status, 200, "warn budget still allows");
    const latest = await waitForLatestWarning(base, admin, "user:ann over tokens budget");
    assert.ok(latest.warnings.some((warning: string) => warning.includes("user:ann over tokens budget")));
  } finally {
    delete process.env.MOLENKOPF_REQUIRE_KEY;
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("key cost budget blocks after recorded euro spend", async () => {
  const upstream = upstreamWithTokens(1, 0);
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-budget-cost-"));
  const s = new IdentityStore(dataDir);
  await s.load();
  await s.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await s.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  s.data.pricing = { default: { inPerMTok: 1_000_000, outPerMTok: 0 } };
  await s.save();
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha", budget: { costLimitEur: 0.5, period: "total", onExceed: "block" } }))!;
  s.close();

  process.env.MOLENKOPF_REQUIRE_KEY = "1";
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const headers = { "content-type": "application/json", authorization: `Bearer ${issued.secret}` };
    assert.equal((await fetch(`${base}/v1/m`, { method: "POST", headers, body: "{}" })).status, 200);
    await waitForKeyCost(base, admin, issued.view.id);
    const blocked = await fetch(`${base}/v1/m`, { method: "POST", headers, body: "{}" });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.tier, "key");
    assert.equal(body.metric, "cost");
  } finally {
    delete process.env.MOLENKOPF_REQUIRE_KEY;
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("cost budgets apply to user team and org tiers", () => {
  const usage = { requests: 1, inputTokens: 0, outputTokens: 0, costEur: 2 };
  const client: any = { id: "user:bob", label: "Bob", source: "api_key", userId: "bob", keyId: "key1", teamIds: ["alpha"] };
  const state: any = {
    usageByKey: { key1: { ...usage, costEur: 0 } },
    usageByUser: { "user:bob": usage },
    usageByTeam: { alpha: usage },
    identity: {
      data: {
        keys: { key1: { budget: undefined } },
        orgBudget: { costLimitEur: 1, period: "total", onExceed: "block" }
      },
      getUser: () => ({ budget: { costLimitEur: 1, period: "total", onExceed: "block" } }),
      getTeam: () => ({ budget: { costLimitEur: 1, period: "total", onExceed: "block" } })
    }
  };
  assert.deepEqual(checkBudgets(state, client), { ok: false, status: 429, error: "budget_exceeded_user", tier: "user", scopeId: "bob", metric: "cost" });
  state.identity.getUser = () => ({ budget: undefined });
  assert.deepEqual(checkBudgets(state, client), { ok: false, status: 429, error: "budget_exceeded_team", tier: "team", scopeId: "alpha", metric: "cost" });
  state.identity.getTeam = () => ({ budget: undefined });
  assert.deepEqual(checkBudgets(state, client), { ok: false, status: 429, error: "budget_exceeded_org", tier: "org", scopeId: "org", metric: "cost" });
});
