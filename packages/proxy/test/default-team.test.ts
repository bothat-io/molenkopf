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

test("default Everyone team cannot be removed", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-default-team-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", displayName: "Admin", password: "admin-secret" }));
    const remove = await post(base, "/__molenkopf/identity/teams/remove", { id: "everyone" }, admin);
    assert.equal(remove.status, 409);
    assert.equal((await remove.json()).error, "cannot_remove_default_team");
    const identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.ok(identity.teams.some((team: any) => team.id === "everyone"));
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
