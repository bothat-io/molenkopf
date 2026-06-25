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
const post = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const postAuth = (base: string, path: string, body: unknown, cookie: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
function cookieFrom(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function pollJson(url: string, init: RequestInit, predicate: (value: any) => boolean): Promise<any> {
  for (let i = 0; i < 50; i++) {
    const value = await fetch(url, init).then((r) => r.json());
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  return fetch(url, init).then((r) => r.json());
}

test("admin/open identity API: teams, users, keys, usage, revoke", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-idapi-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));

    assert.equal((await postAuth(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha", budget: { tokenLimit: 1000, period: "month", onExceed: "block" } }, admin)).status, 200);
    assert.equal((await postAuth(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"] }, admin)).status, 200);

    const identity = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.ok(identity.users.some((u: any) => u.id === "bob" && u.hasPassword === false));
    assert.ok(identity.users.every((u: any) => u.password === undefined), "no password leaked");
    assert.ok(identity.teams.some((t: any) => t.id === "alpha"));

    await postAuth(base, "/__molenkopf/identity/users", { id: "carol", displayName: "Carol", password: "carol-secret", role: "member" }, admin);
    const disabledLogin = await postAuth(base, "/__molenkopf/identity/users", { id: "carol", displayName: "Carol", role: "member", loginDisabled: true }, admin).then((r) => r.json());
    assert.equal(disabledLogin.user.loginDisabled, true);
    assert.equal(disabledLogin.user.hasPassword, true);
    assert.equal((await post(base, "/__molenkopf/login", { username: "carol", password: "carol-secret" })).status, 401);

    const missingProject = await postAuth(base, "/__molenkopf/keys", { owner: "bob", agentLabel: "ci-bot" }, admin).then((r) => r.json());
    assert.equal(missingProject.error, "project_required");

    const invalidTeam = await postAuth(base, "/__molenkopf/keys", { owner: "bob", agentLabel: "ci-bot", project: "project-alpha", teamId: "ghost" }, admin).then((r) => r.json());
    assert.equal(invalidTeam.error, "invalid_key_team");

    await postAuth(base, "/__molenkopf/identity/teams", { id: "beta", name: "Beta" }, admin);
    await postAuth(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha", "beta"] }, admin);
    const missingTeam = await postAuth(base, "/__molenkopf/keys", { owner: "bob", agentLabel: "ci-bot", project: "project-alpha" }, admin).then((r) => r.json());
    assert.equal(missingTeam.error, "team_required");

    const issued = await postAuth(base, "/__molenkopf/keys", { owner: "bob", agentLabel: "ci-bot", project: "project-alpha", teamId: "alpha" }, admin).then((r) => r.json());
    assert.ok(issued.secret.startsWith("mk_"), "secret returned once");
    assert.equal(issued.key.hash, undefined, "key view has no hash");
    assert.equal(issued.key.project, "project-alpha");
    assert.equal(issued.key.teamId, "alpha");

    const keys = await fetch(`${base}/__molenkopf/keys`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(keys.items.length, 1);
    assert.equal(keys.items[0].ownerUserId, "bob");
    assert.equal(keys.items[0].project, "project-alpha");
    assert.equal(keys.items[0].teamId, "alpha");

    const emptyProject = await postAuth(base, "/__molenkopf/keys/update", { id: issued.key.id, agentLabel: "win1", project: "" }, admin).then((r) => r.json());
    assert.equal(emptyProject.error, "project_required");

    const updated = await postAuth(base, "/__molenkopf/keys/update", { id: issued.key.id, agentLabel: "win1", project: "project-alpha/client" }, admin).then((r) => r.json());
    assert.equal(updated.key.agentLabel, "win1");
    assert.equal(updated.key.project, "project-alpha/client");
    assert.equal(updated.key.teamId, "alpha");

    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.ok(usage.users.some((u: any) => u.id === "bob"));
    assert.ok(usage.teams.some((t: any) => t.id === "alpha" && t.members === 1));
    assert.ok(usage.org, "org aggregate present for admin scope");

    assert.equal((await postAuth(base, "/__molenkopf/keys/revoke", { id: issued.key.id }, admin)).status, 200);
    assert.equal((await postAuth(base, "/__molenkopf/keys/revoke", { id: "nope" }, admin)).status, 404);

    assert.equal((await postAuth(base, "/__molenkopf/identity/users/remove", { id: "bob" }, admin)).status, 200);
    const after = await fetch(`${base}/__molenkopf/identity`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.ok(!after.users.some((u: any) => u.id === "bob"), "user removed");
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("member local read APIs are scoped to own key and project traffic", async () => {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ usage: { input_tokens: 3, output_tokens: 1 } }));
  });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-read-scope-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", displayName: "Admin", password: "admin-secret" }));
    await postAuth(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(base, "/__molenkopf/identity/teams", { id: "beta", name: "Beta" }, admin);
    await postAuth(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", password: "bob-secret", role: "member", teamIds: ["alpha"] }, admin);
    await postAuth(base, "/__molenkopf/identity/users", { id: "ana", displayName: "Ana", password: "ana-secret", role: "member", teamIds: ["beta"] }, admin);
    const bobKey = await postAuth(base, "/__molenkopf/keys", { owner: "bob", project: "project-one", teamId: "alpha" }, admin).then((r) => r.json());
    const anaKey = await postAuth(base, "/__molenkopf/keys", { owner: "ana", project: "project-two", teamId: "beta" }, admin).then((r) => r.json());
    await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bobKey.secret}` }, body: "{}" }).then((r) => r.text());
    await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${anaKey.secret}` }, body: "{}" }).then((r) => r.text());
    const bob = cookieFrom(await post(base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));
    const init = { headers: { cookie: bob } };
    const requests = await pollJson(`${base}/__molenkopf/requests`, init, (items) => items.length === 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].client.project, "project-one");
    assert.doesNotMatch(JSON.stringify(requests), /project-two|ana/);
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, init).then((r) => r.json());
    assert.equal(latest.client.project, "project-one");
    const summary = await fetch(`${base}/__molenkopf/audit/summary`, init).then((r) => r.json());
    assert.equal(summary.requests, 1);
    assert.equal(summary.buckets[0].project, "project-one");
    const consumers = await pollJson(`${base}/__molenkopf/consumers`, init, (value) => value.items.some((item: any) => item.id === "user:bob"));
    assert.ok(consumers.items.some((item: any) => item.id === "user:bob"));
    assert.ok(!consumers.items.some((item: any) => item.id === "user:ana"));
    const pluginData = await fetch(`${base}/__molenkopf/plugins/context-compressor-plugin/data`, init);
    assert.equal(pluginData.status, 403);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
