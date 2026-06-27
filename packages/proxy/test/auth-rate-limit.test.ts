import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("login failures are rate limited", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-auth-limit-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  const url = `${base}/__molenkopf/login`;
  try {
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(setup.status, 200);
    for (let i = 0; i < 5; i++) {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "wrong-secret" }) });
      assert.equal(response.status, 401);
    }
    const limited = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
    assert.equal(limited.status, 429);
  } finally {
    await proxy.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
