import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

test("manual env-ref providers persist without raw credentials", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-meta-"));
  let proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  try {
    let base = `http://127.0.0.1:${proxy.port}`;
    let admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const added = await post(base, "/__molenkopf/providers/add", {
      id: "openai-prod",
      name: "OpenAI Prod",
      kind: "openai",
      target: "https://api.openai.com/v1",
      credentialEnv: "OPENAI_PROD_KEY"
    }, admin);
    assert.equal(added.status, 200);
    await proxy.close();

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
    base = `http://127.0.0.1:${proxy.port}`;
    admin = cookieOf(await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" }));
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const provider = providers.items.find((item: { id: string }) => item.id === "openai-prod");
    assert.equal(provider.name, "OpenAI Prod");
    assert.equal(provider.credentialEnv, "OPENAI_PROD_KEY");
    assert.doesNotMatch(await readFile(join(dataDir, "runtime-settings.json"), "utf8"), /fixture|sk-/);
  } finally {
    await proxy.close().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("admin-added CLI providers keep runtime metadata across restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-cli-meta-"));
  let proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  try {
    let base = `http://127.0.0.1:${proxy.port}`;
    let admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    assert.equal((await post(base, "/__molenkopf/providers/add", { id: "codex-local", name: "Codex Local", kind: "cli-codex" }, admin)).status, 200);
    await proxy.close();

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
    base = `http://127.0.0.1:${proxy.port}`;
    admin = cookieOf(await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" }));
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const provider = providers.items.find((item: { id: string }) => item.id === "codex-local");
    assert.equal(provider.kind, "cli");
    assert.equal(provider.runtime, "codex");
    assert.equal(provider.target, "cli://codex-local");
  } finally {
    await proxy.close().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});
