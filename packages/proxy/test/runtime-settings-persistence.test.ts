import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { createRuntimeState } from "../src/http/runtime-state.ts";
import { setConsumerBudget } from "../src/http/local-api-consumer-actions.ts";
import { saveAgentDraft } from "../src/http/local-api-agent-actions.ts";
import { selectProvider, setProviderWeight, setProviderWeights, setRoutingMode } from "../src/http/local-api-provider-actions.ts";
import { togglePlugin } from "../src/http/local-api-plugin-actions.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

async function post(base: string, path: string, body: unknown, cookie = "") {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

test("consumer budgets and agent drafts persist across restart", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-settings-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const target = `http://127.0.0.1:${port}/v1`;
    proxy = await startProxy({ port: 0, target, dataDir: dir });
    let base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/consumers/budget", { id: "user:operator", limit: 1234 }, admin)).status, 200);
    const draft = await post(base, "/__molenkopf/agents/draft", { id: "ci", label: "CI", providerId: "default", tokenLimit: 77 }, admin).then((r) => r.json());
    assert.equal(draft.item.tokenLimit, 77);
    await proxy.close();

    proxy = await startProxy({ port: 0, target, dataDir: dir });
    base = `http://127.0.0.1:${proxy.port}`;
    const cookie = cookieOf(await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" }));
    const consumers = await fetch(`${base}/__molenkopf/consumers`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(consumers.items.find((item: any) => item.id === "user:operator")?.budget, 1234);
    const agents = await fetch(`${base}/__molenkopf/agents`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(agents.items.find((item: any) => item.id === "ci")?.tokenLimit, 77);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime setting write failures roll back successful-looking mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-fail-"));
  const badDataDir = join(dir, "not-a-dir");
  await writeFile(badDataDir, "file");
  const state = createRuntimeState({ target: "http://127.0.0.1:9/v1", dataDir: badDataDir }, "127.0.0.1");
  const budget = await call((req, res) => setConsumerBudget(req, res, state), { id: "user:operator", limit: 5 });
  assert.equal(budget.status, 500);
  assert.equal(state.consumerBudgets["user:operator"], undefined);
  const draft = await call((req, res) => saveAgentDraft(req, res, state), { id: "ci", providerId: "default" });
  assert.equal(draft.status, 500);
  assert.equal(state.agentDrafts.length, 0);

  const routed = createRuntimeState({ target: "http://127.0.0.1:9/v1", dataDir: badDataDir, providers: [{ id: "backup", name: "Backup", kind: "local", target: "http://127.0.0.1:11434/v1", allowDistribution: true }] }, "127.0.0.1");
  assert.equal((await call((req, res) => selectProvider(req, res, routed), { id: "backup" })).status, 500);
  assert.equal(routed.activeProviderId, "default");
  assert.equal((await call((req, res) => setProviderWeight(req, res, routed), { id: "backup", weight: 5 })).status, 500);
  assert.equal(routed.providerWeights.backup, 1);
  assert.equal((await call((req, res) => setProviderWeights(req, res, routed), { weights: { backup: 6 }, mode: "distribute" })).status, 500);
  assert.equal(routed.routingMode, "manual");
  assert.equal(routed.providerWeights.backup, 1);
  assert.equal((await call((req, res) => setRoutingMode(req, res, routed), { mode: "distribute" })).status, 500);
  assert.equal(routed.routingMode, "manual");

  const previousEnabled = state.pluginEnabled["context-compressor-plugin"];
  const plugin = await call((req, res) => togglePlugin(req, res, state), { id: "context-compressor-plugin", enabled: !previousEnabled });
  assert.equal(plugin.status, 500);
  assert.equal(state.pluginEnabled["context-compressor-plugin"], previousEnabled);
  await rm(dir, { recursive: true, force: true });
});

async function call(handler: (req: any, res: any) => Promise<void>, body: unknown): Promise<{ status: number; json: any }> {
  const server = createServer((req, res) => { void handler(req, res); });
  const port = await listenOn(server);
  try {
    const response = await post(`http://127.0.0.1:${port}`, "/", body);
    return { status: response.status, json: await response.json() };
  } finally {
    server.close();
  }
}
