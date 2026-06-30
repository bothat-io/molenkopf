import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

test("provider mutations reject malformed kinds and credential environment refs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-mut-"));
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`, dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/providers/add", { id: "bad-kind", kind: "surprise", target: "https://api.example.test/v1" }, admin)).status, 400);
    assert.equal((await post(base, "/__molenkopf/providers/add", { id: "bad-env", kind: "openai", target: "https://api.example.test/v1", credentialEnv: "bad-name!" }, admin)).status, 400);
    await post(base, "/__molenkopf/providers/add", { id: "secure-api", kind: "openai", target: "https://api.example.test/v1", credential: "fixture-secret" }, admin);
    assert.equal((await post(base, "/__molenkopf/providers/update", { id: "secure-api", name: "Changed", credentialEnv: "bad-name!" }, admin)).status, 400);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.items.find((item: any) => item.id === "secure-api").name, "secure-api");
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider target origin changes cannot silently retain credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-origin-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/providers/add", { id: "secure-api", kind: "openai", target: "https://api.example.test/v1", credential: "fixture-secret" }, admin)).status, 200);
    const rejected = await post(base, "/__molenkopf/providers/update", { id: "secure-api", target: "http://api.example.test/v1" }, admin);
    assert.equal(rejected.status, 409);
    let providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.items.find((item: any) => item.id === "secure-api").target, "https://api.example.test/v1");

    const cleared = await post(base, "/__molenkopf/providers/update", { id: "secure-api", target: "http://api.example.test/v1", clearCredential: true }, admin);
    assert.equal(cleared.status, 200);
    providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const view = providers.items.find((item: any) => item.id === "secure-api");
    assert.equal(view.target, "http://api.example.test/v1");
    assert.equal(view.credentialRef, "none");
  } finally {
    await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider credential updates set auth scheme after initial credentialless setup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-auth-scheme-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/providers/add", { id: "later-auth", kind: "openai", target: "https://api.example.test/v1" }, admin)).status, 200);
    const updated = await post(base, "/__molenkopf/providers/update", { id: "later-auth", credentialEnv: "OPENAI_LATER_KEY" }, admin).then((r) => r.json());
    const view = updated.items.find((item: any) => item.id === "later-auth");
    assert.equal(view.credentialRef, "env:OPENAI_LATER_KEY");
    assert.equal(view.authScheme, "bearer");
  } finally {
    await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
