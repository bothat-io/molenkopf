import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("security changes revoke existing user sessions", async () => {
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: await freshDataDir("session-revoke") });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    await post(base, "/__molenkopf/identity/users", { id: "bob", password: "bob-secret", role: "member", teamIds: ["everyone"] }, admin);
    const bob = cookieFrom(await post(base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));
    assert.equal((await fetch(`${base}/__molenkopf/config`, { headers: { cookie: bob } })).status, 200);
    await post(base, "/__molenkopf/identity/users", { id: "bob", role: "member", disabled: true, teamIds: ["everyone"] }, admin);
    assert.equal((await fetch(`${base}/__molenkopf/config`, { headers: { cookie: bob } })).status, 401);
  } finally {
    await proxy.close();
  }
});

test("concurrent setup attempts create exactly one administrator", async () => {
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: await freshDataDir("setup-race") });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const [first, second] = await Promise.all([
      post(base, "/__molenkopf/setup-admin", { username: "admin-a", password: "admin-secret" }),
      post(base, "/__molenkopf/setup-admin", { username: "admin-b", password: "admin-secret" })
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 403]);
    const cookie = cookieFrom(first.status === 200 ? first : second);
    const identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie } }).then((r) => r.json());
    assert.equal(identity.users.filter((user: { role: string }) => user.role === "admin").length, 1);
  } finally {
    await proxy.close();
  }
});

function post(base: string, path: string, body: unknown, cookie = ""): Promise<Response> {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

function cookieFrom(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

function freshDataDir(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `molenkopf-${name}-`));
}
