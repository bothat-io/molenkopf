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

const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

test("identity budgets can be set and cleared for users and teams", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-identity-budget-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const budget = { tokenLimit: 1000, costLimitEur: 5, period: "month", onExceed: "warn" };

    await post(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha", budget }, admin);
    await post(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], budget }, admin);
    let identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(identity.teams.find((team: any) => team.id === "alpha").budget.costLimitEur, 5);
    assert.equal(identity.users.find((user: any) => user.id === "bob").budget.onExceed, "warn");

    await post(base, "/__molenkopf/identity/teams", { id: "beta", name: "Beta", budget: { tokenLimit: 2000 } }, admin);
    await post(base, "/__molenkopf/identity/users", { id: "carol", displayName: "Carol", role: "member", teamIds: ["beta"], budget: { tokenLimit: 3000 } }, admin);
    const key = await post(base, "/__molenkopf/keys", { owner: "carol", project: "p", teamId: "beta", budget: { tokenLimit: 4000 } }, admin).then((r) => r.json());
    identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.deepEqual(identity.teams.find((team: any) => team.id === "beta").budget, { tokenLimit: 2000, period: "month", onExceed: "block" });
    assert.deepEqual(identity.users.find((user: any) => user.id === "carol").budget, { tokenLimit: 3000, period: "month", onExceed: "block" });
    assert.deepEqual(key.key.budget, { tokenLimit: 4000, period: "month", onExceed: "block" });
    assert.equal((await post(base, "/__molenkopf/identity/users", { id: "bad", budget: { tokenLimit: -1 } }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/keys", { owner: "carol", project: "p", budget: { tokenLimit: 1, period: "year" } }, admin)).status, 400);

    await post(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha", budget: null }, admin);
    await post(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], budget: null }, admin);
    identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(identity.teams.find((team: any) => team.id === "alpha").budget, undefined);
    assert.equal(identity.users.find((user: any) => user.id === "bob").budget, undefined);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
