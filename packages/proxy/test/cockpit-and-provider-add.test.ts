import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0];

test("serves the React dashboard shell at /dashboard routes", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-cockpit-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const setup = await fetch(`${base}/__molenkopf/dashboard`).then((r) => r.text());
    assert.match(setup, /id="root"/);
    const claim = await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" });
    const cockpit = await fetch(`${base}/__molenkopf/dashboard`, { headers: { cookie: cookieOf(claim) } }).then((r) => r.text());
    assert.match(cockpit, /id="root"/);
    const adminRoute = await fetch(`${base}/__molenkopf/dashboard/admin`, { headers: { cookie: cookieOf(claim) } }).then((r) => r.text());
    assert.match(adminRoute, /id="root"/);
    const usageRoute = await fetch(`${base}/__molenkopf/dashboard/usage`, { headers: { cookie: cookieOf(claim) } }).then((r) => r.text());
    assert.match(usageRoute, /id="root"/);
  } finally {
    await proxy.close();
    upstream.close();
  }
});

test("adds a provider at runtime and routes to it", async () => {
  const hits: { [k: string]: number } = {};
  const primary = createServer((req, res) => { hits.primary = (hits.primary ?? 0) + 1; req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const added = createServer((req, res) => { hits.added = (hits.added ?? 0) + 1; req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const pPort = await listenOn(primary);
  const aPort = await listenOn(added);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-add-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${pPort}/v1`, dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const ok = await post(base, "/__molenkopf/providers/add", { id: "local-2", name: "Local 2", kind: "local", target: `http://127.0.0.1:${aPort}/v1` }, admin).then((r) => r.json());
    assert.ok(ok.items.some((p: any) => p.id === "local-2"), "provider appears in catalog");
    // select it and route a request
    await post(base, "/__molenkopf/providers/select", { id: "local-2" }, admin);
    await fetch(`${base}/v1/messages`, { method: "POST", body: "{}" }).then((r) => r.text());
    assert.equal(hits.added, 1, "new provider received the request");

    const dup = await post(base, "/__molenkopf/providers/add", { id: "local-2", kind: "local", target: "http://127.0.0.1:1/v1" }, admin);
    assert.equal(dup.status, 409);
    const bad = await post(base, "/__molenkopf/providers/add", { id: "x", target: "not-a-url" }, admin);
    assert.equal(bad.status, 400);
    const query = await post(base, "/__molenkopf/providers/add", { id: "query", target: `http://127.0.0.1:${aPort}/v1?token=secret` }, admin);
    assert.equal(query.status, 400);
    const privateApi = await post(base, "/__molenkopf/providers/add", { id: "private-api", kind: "openai", target: `http://127.0.0.1:${aPort}/v1` }, admin);
    assert.equal(privateApi.status, 400);
    const userinfo = await post(base, "/__molenkopf/providers/update", { id: "local-2", target: `http://user:pass@127.0.0.1:${aPort}/v1` }, admin);
    assert.equal(userinfo.status, 400);
  } finally {
    await proxy.close();
    primary.close();
    added.close();
  }
});

test("local API rejects API providers that send credentials to private targets", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-private-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const res = await post(base, "/__molenkopf/providers/add", { id: "claude-key", name: "Claude", kind: "anthropic", target: `http://127.0.0.1:${port}/v1`, credential: "fixture-anthropic-secret" }, admin);
    assert.equal(res.status, 400);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.doesNotMatch(JSON.stringify(providers), /fixture-anthropic-secret/);
  } finally {
    await proxy.close();
    upstream.close();
  }
});

test("adds first-class Ollama and Codex CLI providers", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-kinds-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const ollama = await post(base, "/__molenkopf/providers/add", { id: "ollama-dev", kind: "ollama", name: "Ollama Dev" }, admin).then((r) => r.json());
    const codex = await post(base, "/__molenkopf/providers/add", { id: "codex-local", kind: "cli-codex", name: "Codex Local" }, admin).then((r) => r.json());
    const ollamaProvider = ollama.items.find((item: any) => item.id === "ollama-dev");
    const codexProvider = codex.items.find((item: any) => item.id === "codex-local");

    assert.equal(ollamaProvider.target, "http://127.0.0.1:11434/v1");
    assert.equal(ollamaProvider.authScheme, "none");
    assert.equal(ollamaProvider.protocol, "ollama-tags");
    assert.equal(codexProvider.kind, "cli");
    assert.equal(codexProvider.runtime, "codex");
    assert.equal(codexProvider.cliCommand, "codex");
    assert.equal(codexProvider.cliArgs, undefined);
  } finally {
    await proxy.close();
  }
});
