import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPasswordAsync } from "../../core/src/auth/password.ts";
import { parseMolenkopfConfigJson } from "../../core/src/config/molenkopf-config.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";
import { resolveRouting } from "../src/http/agent-router.ts";
import { createRuntimeState } from "../src/http/runtime-state.ts";
import { startProxy } from "../src/http/server.ts";

const unattributedClient = { id: "unattributed", label: "unattributed client", source: "unattributed" as const };

test("spoofed config agent ids cannot select pinned providers", async () => {
  const state = createRuntimeState({
    target: "http://127.0.0.1:1/v1",
    providers: [{ id: "backup", name: "Backup", kind: "api", target: "http://127.0.0.1:2/v1" }],
    configAgents: [{ id: "beta", providerId: "backup" }]
  }, "127.0.0.1");
  const routed = resolveRouting(state, new Headers({ "x-molenkopf-agent": "beta" }), unattributedClient);
  assert.equal(routed.ok, false);
  if (!routed.ok) assert.equal(routed.error, "agent_forbidden");
});

test("config agents resolve a provider via profile binding", () => {
  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [
      { id: "openai-main", name: "OpenAI", kind: "openai-compatible", baseUrl: "https://api.openai.com/v1" },
      { id: "claude-main", name: "Claude", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1" }
    ],
    profiles: [{ id: "work", providerId: "claude-main" }],
    agents: [{ id: "coder", profileId: "work" }]
  }));
  assert.deepEqual(config.agents, [{ id: "coder", providerId: "claude-main", enabled: true, profileId: "work" }]);
});

test("config agent model policy blocks disallowed models before upstream", async () => {
  let hits = 0;
  const upstream = createServer((req, res) => { hits++; req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  const port = await listenOn(upstream);
  const seeded = await seedAgentKey("coder");
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${port}/v1`,
    dataDir: seeded.dataDir,
    configAgents: [{ id: "coder", providerId: "default", enabled: true, allowedModels: ["allowed-model"] }]
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await loginAdmin(base);
    const denied = await fetch(`${base}/v1/responses`, { method: "POST", headers: jsonAuth(seeded.secret, "coder"), body: JSON.stringify({ model: "other-model", input: "x" }) });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "model_forbidden" });
    assert.equal(hits, 0);
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(latest.statusCode, 403);
    assert.equal(latest.requestedModel, "other-model");
    const allowed = await fetch(`${base}/v1/responses`, { method: "POST", headers: jsonAuth(seeded.secret, "coder"), body: JSON.stringify({ model: "allowed-model", input: "x" }) });
    assert.equal(allowed.status, 200);
    await allowed.text();
    assert.equal(hits, 1);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(seeded.dataDir, { recursive: true, force: true });
  }
});

test("config agent default model is inserted before forwarding", async () => {
  const captured: Record<string, unknown>[] = [];
  const upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => { captured.push(JSON.parse(Buffer.concat(chunks).toString("utf8"))); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  });
  const port = await listenOn(upstream);
  const seeded = await seedAgentKey("coder");
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${port}/v1`,
    dataDir: seeded.dataDir,
    configAgents: [{ id: "coder", providerId: "default", enabled: true, allowedModels: ["default-model", "custom-model"], defaultModel: "default-model" }]
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const defaulted = await fetch(`${base}/v1/responses`, { method: "POST", headers: jsonAuth(seeded.secret, "coder"), body: JSON.stringify({ input: "x" }) });
    assert.equal(defaulted.status, 200);
    assert.equal(captured.at(-1)?.model, "default-model");
    const explicit = await fetch(`${base}/v1/responses`, { method: "POST", headers: jsonAuth(seeded.secret, "coder"), body: JSON.stringify({ model: "custom-model", input: "x" }) });
    assert.equal(explicit.status, 200);
    assert.equal(captured.at(-1)?.model, "custom-model");
  } finally {
    await proxy.close();
    upstream.close();
    await rm(seeded.dataDir, { recursive: true, force: true });
  }
});

test("config agent plugin policy limits request body plugins", async () => {
  let captured = "";
  const upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => { captured = Buffer.concat(chunks).toString("utf8"); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  });
  const port = await listenOn(upstream);
  const seeded = await seedAgentKey("no-plugins");
  const proxy = await startProxy({
    port: 0,
    target: `http://127.0.0.1:${port}/v1`,
    dataDir: seeded.dataDir,
    configAgents: [{ id: "no-plugins", providerId: "default", enabled: true, enabledPluginIds: [] }]
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const log = Array.from({ length: 260 }, (_, i) => `ERROR ${i} repeatable operational output`).join("\n");
    const body = JSON.stringify({ input: log });
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: jsonAuth(seeded.secret, "no-plugins"), body });
    assert.equal(response.status, 200);
    assert.equal(captured, body);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(seeded.dataDir, { recursive: true, force: true });
  }
});

async function seedAgentKey(agentLabel: string): Promise<{ dataDir: string; secret: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-agent-policy-"));
  const store = new IdentityStore(dataDir);
  await store.load();
  await store.putTeam({ id: "team", name: "Team", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await store.putUser({ id: "admin", displayName: "Admin", role: "admin", teamIds: ["team"], password: await hashPasswordAsync("admin-secret"), sessionVersion: 0, createdAt: "x" });
  await store.putTeam({ ...store.getTeam("team")!, managerIds: ["admin"] });
  await store.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["team"], createdAt: "x" });
  const issued = await issueApiKey(store, "bob", { agentLabel, project: "policy", teamId: "team" });
  store.close();
  assert.ok(issued);
  return { dataDir, secret: issued.secret };
}

function jsonAuth(secret: string, agent: string): HeadersInit {
  return { "content-type": "application/json", authorization: `Bearer ${secret}`, "x-molenkopf-agent": agent };
}

async function loginAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin-secret" })
  });
  assert.equal(response.status, 200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
