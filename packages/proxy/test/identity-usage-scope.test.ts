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
const cookieFrom = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

async function pollJson(url: string, init: RequestInit, predicate: (value: any) => boolean): Promise<any> {
  for (let i = 0; i < 50; i++) {
    const value = await fetch(url, init).then((r) => r.json());
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  return fetch(url, init).then((r) => r.json());
}

test("member usage scope includes own team summaries but no org aggregate", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ usage: { input_tokens: 5, output_tokens: 7 } })); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-usage-scope-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", displayName: "Admin", password: "admin-secret" }));
    await postAuth(base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", password: "bob-secret", role: "member", teamIds: ["alpha"] }, admin);
    const issued = await postAuth(base, "/__molenkopf/keys", { owner: "bob", project: "project-alpha", teamId: "alpha" }, admin).then((r) => r.json());
    await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.secret}` }, body: "{}" }).then((r) => r.text());
    const bob = cookieFrom(await post(base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));
    const usage = await pollJson(`${base}/__molenkopf/usage`, { headers: { cookie: bob } }, (value) => value.users[0]?.usage.inputTokens === 5);
    assert.equal(usage.scope, "bob");
    assert.deepEqual(usage.teams.map((team: any) => team.id).sort(), ["alpha"]);
    const alpha = usage.teams.find((team: any) => team.id === "alpha");
    assert.equal(alpha.members, 1);
    assert.equal(alpha.usage.inputTokens, 5);
    assert.equal(usage.users.length, 1);
    assert.equal(usage.keys[0].usage.outputTokens, 7);
    assert.equal(usage.org, undefined);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("manager usage scope includes managed teams without unrelated teams", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ usage: { input_tokens: 2, output_tokens: 3 } })); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-manager-scope-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    await postAuth(base, "/__molenkopf/identity/users", { id: "mona", displayName: "Mona", password: "mona-secret", role: "manager", teamIds: [] }, admin);
    await postAuth(base, "/__molenkopf/identity/teams", { id: "managed", name: "Managed", managerIds: ["mona"] }, admin);
    await postAuth(base, "/__molenkopf/identity/teams", { id: "other", name: "Other" }, admin);
    await postAuth(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", role: "member", teamIds: ["managed"] }, admin);
    const issued = await postAuth(base, "/__molenkopf/keys", { owner: "bob", project: "managed-project", teamId: "managed" }, admin).then((r) => r.json());
    await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.secret}` }, body: "{}" }).then((r) => r.text());
    const manager = cookieFrom(await post(base, "/__molenkopf/login", { username: "mona", password: "mona-secret" }));
    const usage = await pollJson(`${base}/__molenkopf/usage`, { headers: { cookie: manager } }, (value) => value.teams.some((team: any) => team.id === "managed"));
    assert.deepEqual(usage.teams.map((team: any) => team.id).sort(), ["managed"]);
    assert.ok(!usage.teams.some((team: any) => team.id === "other"));
    const managed = usage.teams.find((team: any) => team.id === "managed");
    assert.equal(managed.members, 1);
    assert.equal(managed.usage.outputTokens, 3);
    assert.equal(usage.org, undefined);
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});

test("default everyone membership does not expose unrelated user traffic", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } })); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-everyone-scope-"));
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    await postAuth(base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", password: "bob-secret", role: "member", teamIds: ["everyone"] }, admin);
    await postAuth(base, "/__molenkopf/identity/users", { id: "ana", displayName: "Ana", password: "ana-secret", role: "member", teamIds: ["everyone"] }, admin);
    const bobKey = await postAuth(base, "/__molenkopf/keys", { owner: "bob", project: "bob-project" }, admin).then((r) => r.json());
    const anaKey = await postAuth(base, "/__molenkopf/keys", { owner: "ana", project: "ana-project" }, admin).then((r) => r.json());
    await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bobKey.secret}` }, body: "{}" }).then((r) => r.text());
    await fetch(`${base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${anaKey.secret}` }, body: "{}" }).then((r) => r.text());

    const bob = cookieFrom(await post(base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));
    const init = { headers: { cookie: bob } };
    const requests = await pollJson(`${base}/__molenkopf/requests`, init, (items) => items.length === 1);
    assert.equal(requests[0].client.project, "bob-project");
    assert.doesNotMatch(JSON.stringify(requests), /ana-project|ana/);
    const usage = await pollJson(`${base}/__molenkopf/usage`, init, (value) => value.users[0]?.usage.inputTokens === 1);
    assert.deepEqual(usage.teams, []);
    assert.equal(usage.keys.length, 1);
    assert.equal(usage.keys[0].project, "bob-project");
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
  }
});
