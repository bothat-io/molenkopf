import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, cookieOf, issueKey } from "./proxy-auth-utils.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
const post = (base: string, p: string, b: unknown, cookie = "") => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(b) });
async function pollJson(url: string, predicate: (v: any) => boolean, attempts = 60, cookie = ""): Promise<any> {
  const init = cookie ? { headers: { cookie } } : undefined;
  for (let i = 0; i < attempts; i++) { const v = await fetch(url, init).then((r) => r.json()); if (predicate(v)) return v; await new Promise((r) => setTimeout(r, 10)); }
  return fetch(url, init).then((r) => r.json());
}

test("per-user budget blocks once exceeded and shows live usage + savings", async () => {
  const upstream = createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ usage: { input_tokens: 900, output_tokens: 200 } })); }); });
  const port = await listenOn(upstream);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-consumer-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const key = await issueKey(base, admin, "consumer-budget");
    await post(base, "/__molenkopf/consumers/budget", { id: "user:admin", limit: 1000 }, admin);
    const first = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" });
    await first.text();
    assert.equal(first.status, 200);
    await pollJson(`${base}/__molenkopf/consumers`, (c) => (c.items.find((i: any) => i.id === "user:admin")?.usage.inputTokens ?? 0) >= 900, 60, admin);
    const second = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" });
    assert.equal(second.status, 429);
    const consumers = await fetch(`${base}/__molenkopf/consumers`, { headers: { cookie: admin } }).then((r) => r.json());
    const operator = consumers.items.find((i: any) => i.id === "user:admin");
    assert.equal(operator.budget, 1000);
    assert.ok(operator.usage.inputTokens >= 900);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("visible email user consumer budgets block API key owners", async () => {
  const upstream = createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ usage: { input_tokens: 900, output_tokens: 200 } })); }); });
  const port = await listenOn(upstream);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-email-budget-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin@example.test", password: "admin-secret" }));
    const keyBody = await post(base, "/__molenkopf/keys", { owner: "admin@example.test", project: "email-budget", teamId: "everyone" }, admin).then((r) => r.json());
    const first = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(keyBody.secret, { "content-type": "application/json" }), body: "{}" });
    assert.equal(first.status, 200);
    await first.text();
    const id = "user:admin@example.test";
    await pollJson(`${base}/__molenkopf/consumers`, (c) => (c.items.find((i: any) => i.id === id)?.usage.inputTokens ?? 0) >= 900, 60, admin);
    await post(base, "/__molenkopf/consumers/budget", { id, limit: 1000 }, admin);
    const second = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(keyBody.secret, { "content-type": "application/json" }), body: "{}" });
    assert.equal(second.status, 429);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider can be updated and removed at runtime", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-update-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    await post(base, "/__molenkopf/providers/add", { id: "extra", name: "Extra", kind: "local", target: `http://127.0.0.1:${port}/v1` }, admin);
    const updated = await post(base, "/__molenkopf/providers/update", { id: "extra", name: "Renamed" }, admin).then((r) => r.json());
    assert.equal(updated.items.find((p: any) => p.id === "extra").name, "Renamed");
    const unsafe = await post(base, "/__molenkopf/providers/update", { id: "extra", target: "file:///etc/passwd" }, admin);
    assert.equal(unsafe.status, 400, "update rejects unsafe target scheme");
    const removed = await post(base, "/__molenkopf/providers/remove", { id: "extra" }, admin).then((r) => r.json());
    assert.equal(removed.items.some((p: any) => p.id === "extra"), false);
    const noDefault = await post(base, "/__molenkopf/providers/remove", { id: "default" }, admin);
    assert.equal(noDefault.status, 409);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
