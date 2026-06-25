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

const post = (base: string, path: string, body: unknown, cookie?: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

function cookieFrom(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

test("member own API key permissions gate create and revoke", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-key-perms-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", displayName: "Admin", password: "admin-secret" }));
    await post(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await post(base, "/__molenkopf/identity/users", {
      id: "bob",
      displayName: "Bob",
      password: "bob-secret",
      role: "member",
      teamIds: ["alpha"],
      keyPermissions: { create: false, revoke: false }
    }, admin);
    const issued = await post(base, "/__molenkopf/keys", { owner: "bob", project: "project-alpha", teamId: "alpha" }, admin).then((r) => r.json());
    const bob = cookieFrom(await post(base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));

    const create = await post(base, "/__molenkopf/keys", { project: "project-alpha", teamId: "alpha" }, bob);
    assert.equal(create.status, 403);
    assert.equal((await create.json()).error, "key_create_forbidden");

    const revoke = await post(base, "/__molenkopf/keys/revoke", { id: issued.key.id }, bob);
    assert.equal(revoke.status, 403);
    assert.equal((await revoke.json()).error, "key_revoke_forbidden");
    assert.equal((await post(base, "/__molenkopf/keys/revoke", { id: issued.key.id }, admin)).status, 200);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
