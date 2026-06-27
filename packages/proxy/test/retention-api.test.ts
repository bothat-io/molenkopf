import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
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
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

test("admin can purge persisted audit state", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-retention-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const key = await issueKey(base, admin, "retention");
    await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" }).then((r) => r.text());
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.ok(latest.requestId, "audit entry exists before purge");
    assert.equal((await post(base, "/__molenkopf/retention/purge", { scope: "audit" })).status, 401);
    assert.equal((await fetch(`${base}/__molenkopf/retention/purge`, { headers: { cookie: admin } })).status, 405);
    assert.equal((await post(base, "/__molenkopf/retention/purge", {}, admin)).status, 400);
    const purge = await post(base, "/__molenkopf/retention/purge", { scope: "audit" }, admin).then((r) => r.json());
    assert.deepEqual(purge.purged, { audit: true, retrieval: false });
    const after = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.deepEqual(after, {});
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
