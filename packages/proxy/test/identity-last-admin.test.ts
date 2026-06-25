import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

const post = (base: string, path: string, body: unknown, cookie?: string) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });

const cookieFrom = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

test("identity API preserves at least one enabled password admin", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-last-admin-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "admin", role: "member" }, admin)).status, 409);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "admin", role: "admin", disabled: true }, admin)).status, 409);
    assert.equal((await post(base, "/__molenkopf/identity/users/remove", { id: "admin" }, admin)).status, 409);

    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "backup", role: "admin", password: "backup-secret", teamIds: ["everyone"] }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/identity/users/remove", { id: "admin" }, admin)).status, 200);
    const backup = cookieFrom(await post(base, "/__molenkopf/login", { username: "backup", password: "backup-secret" }));
    assert.equal((await post(base, "/__molenkopf/identity/users/remove", { id: "backup" }, backup)).status, 409);
  } finally {
    await proxy.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
