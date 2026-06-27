import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { hashPassword, verifyPassword } from "../../core/src/auth/password.ts";
import { signSession, verifySession, newSessionSecret } from "../../core/src/auth/session.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
function cookieFrom(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

test("password hashing and session signing round-trip", () => {
  const h = hashPassword("hunter2");
  assert.ok(verifyPassword("hunter2", h));
  assert.ok(!verifyPassword("wrong", h));
  const secret = newSessionSecret();
  const token = signSession("admin", secret);
  assert.equal(verifySession(token, secret), "admin");
  assert.equal(verifySession(token, newSessionSecret()), undefined, "wrong secret rejected");
  assert.equal(verifySession(signSession("admin", secret, -1), secret), undefined, "expired rejected");
});

test("login gates control APIs; roles gate management", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-authtest-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;

    assert.equal((await fetch(`${base}/__molenkopf/providers`)).status, 401, "no session -> 401");
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(setup.status, 200);

    assert.equal((await fetch(`${base}/__molenkopf/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "nope" }) })).status, 401);
    const ok = await fetch(`${base}/__molenkopf/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(ok.status, 200);
    const admin = cookieFrom(ok);
    assert.equal((await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } })).status, 200);
    assert.equal((await fetch(`${base}/__molenkopf/providers/test`, { headers: { cookie: admin } })).status, 405, "GET cannot trigger provider tests");
    const meRes = await fetch(`${base}/__molenkopf/me`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(meRes.user.role, "admin");
    assert.equal(meRes.user.canManage, true);

    // admin creates a normal member; member can read but not manage
    const createMember = await fetch(`${base}/__molenkopf/identity/users`, { method: "POST", headers: { "content-type": "application/json", cookie: admin }, body: JSON.stringify({ id: "bob", password: "bob-secret", role: "member", teamIds: ["everyone"] }) });
    assert.equal(createMember.status, 200);
    const bobLogin = await fetch(`${base}/__molenkopf/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "bob", password: "bob-secret" }) });
    const bob = cookieFrom(bobLogin);
    const memberConfig = await fetch(`${base}/__molenkopf/config`, { headers: { cookie: bob } }).then((r) => r.json());
    assert.equal(memberConfig.target, undefined, "member config hides upstream target");
    assert.equal((await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: bob } })).status, 403, "member cannot read provider topology");
    assert.equal((await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: bob } })).status, 403, "member cannot read plugin topology");
    assert.equal((await fetch(`${base}/__molenkopf/agents`, { headers: { cookie: bob } })).status, 403, "member cannot read agent metadata");
    assert.equal((await fetch(`${base}/__molenkopf/stats`, { headers: { cookie: bob } })).status, 403, "member cannot read system stats");
    const manage = await fetch(`${base}/__molenkopf/routing/mode`, { method: "POST", headers: { "content-type": "application/json", cookie: bob }, body: JSON.stringify({ mode: "distribute" }) });
    assert.equal(manage.status, 403, "member cannot manage");
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("public bind requires explicit opt-in and keeps first-run available", async () => {
  await assert.rejects(
    startProxy({ port: 0, host: "0.0.0.0", target: "http://127.0.0.1:9/v1", dataDir: await freshDataDir("public-flag") }),
    /--allow-public-bind/
  );
  const proxy = await startProxy({ port: 0, host: "0.0.0.0", allowPublicBind: true, target: "http://127.0.0.1:9/v1", dataDir: await freshDataDir("public-ok") });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const before = await fetch(`${base}/__molenkopf/me`).then((r) => r.json());
    assert.equal(before.needsSetup, true);
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(setup.status, 200);
    const second = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ username: "root", password: "admin-secret" }) });
    assert.equal(second.status, 403);
  } finally {
    await proxy.close();
  }
});

test("control plane writes require JSON and same-origin or absent origin", async () => {
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: await freshDataDir("origin") });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const badOrigin = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.test" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(badOrigin.status, 403);
    const badType = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(badType.status, 415);
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(setup.status, 200);
    const admin = cookieFrom(setup);
    const crossManage = await fetch(`${base}/__molenkopf/routing/mode`, { method: "POST", headers: { "content-type": "application/json", cookie: admin, origin: "http://evil.test" }, body: JSON.stringify({ mode: "manual" }) });
    assert.equal(crossManage.status, 403);
    const badManageType = await fetch(`${base}/__molenkopf/routing/mode`, { method: "POST", headers: { cookie: admin }, body: JSON.stringify({ mode: "manual" }) });
    assert.equal(badManageType.status, 415);
    const okManage = await fetch(`${base}/__molenkopf/routing/mode`, { method: "POST", headers: { "content-type": "application/json", cookie: admin, origin: base }, body: JSON.stringify({ mode: "manual" }) });
    assert.equal(okManage.status, 200);
  } finally {
    await proxy.close();
  }
});

test("control plane writes allow the configured dashboard dev origin", async () => {
  const previous = process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN;
  process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = "http://127.0.0.1:5173";
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-dev-origin-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  const localhostDataDir = await mkdtemp(join(tmpdir(), "molenkopf-dev-localhost-"));
  const localhostProxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: localhostDataDir });
  const localhostBase = `http://127.0.0.1:${localhostProxy.port}`;
  try {
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({ username: "admin", password: "admin-secret" })
    });
    assert.equal(setup.status, 200);

    const localhostSetup = await fetch(`${localhostBase}/__molenkopf/setup-admin`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ username: "root", password: "admin-secret" })
    });
    assert.equal(localhostSetup.status, 200);

    const admin = cookieFrom(setup);
    const crossManage = await fetch(`${base}/__molenkopf/routing/mode`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin, origin: "http://evil.test" },
      body: JSON.stringify({ mode: "manual" })
    });
    assert.equal(crossManage.status, 403);
  } finally {
    if (previous === undefined) delete process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN;
    else process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = previous;
    await proxy.close();
    await localhostProxy.close();
  }
});

test("a malformed session cookie does not crash auth", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir: await freshDataDir("bad-cookie") });
    const base = `http://127.0.0.1:${proxy.port}`;
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(setup.status, 200);
    const res = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: "molenkopf_session=%E0%A4%A" } });
    assert.equal(res.status, 401, "malformed cookie -> 401, not 500");
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

function freshDataDir(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `molenkopf-${name}-`));
}
