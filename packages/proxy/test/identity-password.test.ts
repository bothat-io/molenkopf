import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("identity user passwords fail loudly when too short", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-password-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:65535/v1", dataDir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookie(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));

    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "test", displayName: "Test", role: "member", teamIds: ["everyone"] }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/login", { username: "test", password: "test" })).status, 401);

    const weak = await post(base, "/__molenkopf/identity/users", { id: "test", password: "test" }, admin);
    assert.equal(weak.status, 400);
    assert.equal((await weak.json()).error, "weak_password");

    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "test", password: "test-secret" }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/login", { username: "test", password: "test-secret" })).status, 200);
  } finally {
    await proxy.close();
  }
});

test("oversized setup passwords are rejected before initialization", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-password-large-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:65535/v1", dataDir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const large = await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "x".repeat(5000) });
    assert.equal(large.status, 400);
    assert.equal((await large.json()).error, "password_too_long");
    assert.equal((await fetch(`${base}/__molenkopf/me`).then((r) => r.json())).needsSetup, true);
  } finally {
    await proxy.close();
  }
});

function post(base: string, path: string, body: unknown, cookieValue = "") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookieValue) headers.cookie = cookieValue;
  return fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function cookie(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
