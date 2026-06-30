import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";

const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

test("identity APIs reject invalid references and passwordless enabled users", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200); res.end("{}"); });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  const upstreamPort = typeof address === "object" && address ? address.port : 0;
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-identity-invariants-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "nopass", role: "member" }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/login", { username: "nopass", password: "anything" })).status, 401);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "badlogin", role: "member", loginDisabled: false }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "disabled", role: "member", disabled: true }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", password: "bob-secret", teamIds: ["missing"] }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", password: "bob-secret" }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", role: "owner" }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", keyPermissions: "all" }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", keyPermissions: { create: "yes" } }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bob", keyPermissions: { create: false } }, admin)).status, 200);
    const identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    const bob = identity.users.find((user: any) => user.id === "bob");
    assert.equal(bob.role, "member");
    assert.deepEqual(bob.keyPermissions, { create: false });
    assert.equal((await post(base, "/__molenkopf/identity/teams", { id: "bad-manager", managerIds: ["ghost"] }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/teams", { id: "bad-member", memberIds: ["ghost"] }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/teams", { id: "bad-provider", allowedProviders: ["ghost"] }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/identity/teams", { id: "alpha", managerIds: ["bob"], memberIds: ["bob"], allowedProviders: ["default"] }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/identity/teams", { id: "everyone", memberIds: [] }, admin)).status, 200);
    assert.equal((await post(base, "/__molenkopf/identity/users/remove", { id: "bob" }, admin)).status, 200);
    const stored = new IdentityStore(dataDir);
    await stored.load();
    assert.equal(stored.getUser("admin")?.teamIds.includes("everyone"), true);
    assert.deepEqual(stored.getTeam("alpha")?.managerIds, []);
    stored.close();
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
