import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey } from "./proxy-auth-utils.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0];

test("plugin API exposes only optional plugins", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-plugins-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));

    const plugins = await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.deepEqual(plugins.items.map((p: any) => p.id).sort(), ["context-compressor-plugin", "project-graph-plugin", "token-optimizer-plugin"]);
    assert.equal(plugins.items.every((p: any) => p.canToggle), true);
    assert.equal(plugins.items.some((p: any) => p.id === "core-redaction"), false);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("plugin toggles and provider weights persist across restart", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-settings-"));
  let first;
  try {
    first = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir, providers: [{ id: "local-weight", name: "Local Weight", kind: "local", target: `http://127.0.0.1:${port}/v1` }] });
    const base = `http://127.0.0.1:${first.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    await post(base, "/__molenkopf/plugins/toggle", { id: "context-compressor-plugin", enabled: true }, admin);
    await post(base, "/__molenkopf/providers/weight", { id: "local-weight", weight: 7 }, admin);
  } finally {
    if (first) await first.close();
  }

  let second;
  try {
    second = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir, providers: [{ id: "local-weight", name: "Local Weight", kind: "local", target: `http://127.0.0.1:${port}/v1` }] });
    const base = `http://127.0.0.1:${second.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" }));
    const plugins = await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(plugins.items.find((p: any) => p.id === "context-compressor-plugin").enabled, true);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.items.find((p: any) => p.id === "local-weight").weight, 7);
  } finally {
    if (second) await second.close();
    upstream.close();
  }
});

test("stale core plugin settings are ignored while core redaction stays active", async () => {
  let captured = "";
  const upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      captured = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200, {});
      res.end("{}");
    });
  });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-core-plugin-settings-"));
  await writeFile(join(dataDir, "runtime-settings.json"), JSON.stringify({ pluginEnabled: { "core-redaction": false, "context-compressor-plugin": true } }));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const key = await issueKey(base, admin, "core-plugin-settings");
    const plugins = await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(plugins.items.some((p: any) => p.id === "core-redaction"), false);
    assert.equal(plugins.items.find((p: any) => p.id === "context-compressor-plugin").enabled, true);
    const coreToggle = await post(base, "/__molenkopf/plugins/toggle", { id: "core-redaction", enabled: false }, admin);
    assert.equal(coreToggle.status, 404);
    const coreToggleBody = await coreToggle.json();
    assert.equal(coreToggleBody.error, "unknown_plugin");

    const longLog = Array.from({ length: 260 }, (_, i) => `line ${i} token=persisted-raw-secret`).join("\n");
    const sent = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ input: longLog }) });
    assert.equal(sent.status, 200);
    assert.doesNotMatch(captured, /persisted-raw-secret/);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("first-run admin setup secures the admin panel from the UI", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-setup-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;

    const setupPage = await fetch(`${base}/__molenkopf/dashboard`).then((r) => r.text());
    assert.match(setupPage, /id="root"/);
    assert.doesNotMatch(setupPage, /Gateway command center/);

    const me0 = await fetch(`${base}/__molenkopf/me`).then((r) => r.json());
    assert.equal(me0.open, true);
    assert.equal(me0.needsSetup, true, "open mode prompts for setup");
    assert.equal((await fetch(`${base}/__molenkopf/providers`)).status, 401, "first-run hides provider metadata");
    assert.equal((await post(base, "/__molenkopf/routing/mode", { mode: "manual" })).status, 401, "first-run blocks manage APIs");

    const setup = await post(base, "/__molenkopf/setup-admin", { username: "admin@example.test", displayName: "Example Admin", password: "admin-secret" });
    assert.equal(setup.status, 200);
    const cookie = cookieOf(setup);

    const loginPage = await fetch(`${base}/__molenkopf/dashboard`).then((r) => r.text());
    assert.match(loginPage, /id="root"/);
    assert.doesNotMatch(loginPage, /Gateway command center/);
    const loggedOutMe = await fetch(`${base}/__molenkopf/me`);
    assert.equal(loggedOutMe.status, 200, "after setup, logged-out session probe stays quiet");
    assert.deepEqual(await loggedOutMe.json(), {});
    const me1 = await fetch(`${base}/__molenkopf/me`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(me1.user.id, "admin@example.test");
    assert.equal(me1.user.displayName, "Example Admin");
    assert.equal(me1.user.role, "admin");
    const ownKey = await post(base, "/__molenkopf/keys", { agentLabel: "my laptop", project: "admin-setup" }, cookie).then((r) => r.json());
    assert.ok(ownKey.secret.startsWith("mk_"), "admin overview creates own key without owner field");
    assert.equal(ownKey.key.ownerUserId, "admin@example.test");
    const adminPage = await fetch(`${base}/__molenkopf/dashboard`, { headers: { cookie } }).then((r) => r.text());
    assert.match(adminPage, /id="root"/);
    assert.equal((await post(base, "/__molenkopf/routing/mode", { mode: "manual" })).status, 401, "manage now needs auth");
    assert.equal((await post(base, "/__molenkopf/routing/mode", { mode: "manual" }, cookie)).status, 200, "admin can manage");

    // cannot claim admin twice
    assert.equal((await post(base, "/__molenkopf/setup-admin", { username: "x", password: "yyyyyy" })).status, 403);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("only admins manage the control plane and can grant admin role", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-admin-role-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const setup = await post(base, "/__molenkopf/setup-admin", { username: "root", password: "admin-secret" });
    const root = cookieOf(setup);

    await post(base, "/__molenkopf/identity/users", { id: "alice", displayName: "Alice", role: "admin", password: "alice-secret", teamIds: ["everyone"] }, root);
    const aliceLogin = await post(base, "/__molenkopf/login", { username: "alice", password: "alice-secret" });
    const alice = cookieOf(aliceLogin);
    assert.equal((await post(base, "/__molenkopf/routing/mode", { mode: "manual" }, alice)).status, 200, "new admin can manage");

    await post(base, "/__molenkopf/identity/users", { id: "max", displayName: "Max", role: "manager", password: "max-secret", teamIds: ["everyone"] }, root);
    const maxLogin = await post(base, "/__molenkopf/login", { username: "max", password: "max-secret" });
    const max = cookieOf(maxLogin);
    assert.equal((await post(base, "/__molenkopf/routing/mode", { mode: "manual" }, max)).status, 403, "manager is not an admin");
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
