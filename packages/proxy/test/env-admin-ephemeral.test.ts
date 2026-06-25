import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";

const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

test("environment-seeded admin remains memory-only across identity saves", async () => {
  const oldPassword = process.env.MOLENKOPF_ADMIN_PASSWORD;
  process.env.MOLENKOPF_ADMIN_PASSWORD = "admin-secret";
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-env-admin-"));
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`, dataDir: dir });
    let base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" }));
    assert.ok(admin);
    assert.equal((await post(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha", managerIds: ["admin"] }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", password: "bob-secret", role: "member", teamIds: ["alpha"] }, admin)).status, 200);
    await proxy.close();
    proxy = undefined;

    const stored = new IdentityStore(dir);
    await stored.load();
    assert.equal(stored.getUser("admin"), undefined);
    assert.deepEqual(stored.getTeam("alpha")?.managerIds, []);
    stored.close();

    delete process.env.MOLENKOPF_ADMIN_PASSWORD;
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`, dataDir: dir });
    base = `http://127.0.0.1:${proxy.port}`;
    assert.equal((await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" })).status, 401);
    assert.equal((await post(base, "/__molenkopf/login", { username: "bob", password: "bob-secret" })).status, 200);
  } finally {
    if (oldPassword === undefined) delete process.env.MOLENKOPF_ADMIN_PASSWORD; else process.env.MOLENKOPF_ADMIN_PASSWORD = oldPassword;
    if (proxy) await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
