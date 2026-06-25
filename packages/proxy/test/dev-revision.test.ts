import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

async function withProxyEnv(env: Record<string, string | undefined>, run: (base: string) => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) value === undefined ? delete process.env[key] : process.env[key] = value;
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-dev-revision-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir });
  try {
    await run(`http://127.0.0.1:${proxy.port}`);
  } finally {
    await proxy.close();
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
}

const setupAdmin = (base: string) => fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });

test("dev revision endpoint works after setup in the dev profile", async () => {
  await withProxyEnv({ MOLENKOPF_PROFILE: "dev", MOLENKOPF_DEV_REVISION: "rev-test" }, async (base) => {
    assert.equal((await fetch(`${base}/__molenkopf/dev/revision`)).status, 401);
    await setupAdmin(base);
    const res = await fetch(`${base}/__molenkopf/dev/revision`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { revision: "rev-test" });
  });
});

test("dev revision endpoint is hidden outside the dev profile", async () => {
  await withProxyEnv({ MOLENKOPF_PROFILE: "prod", MOLENKOPF_DEV_REVISION: "rev-test" }, async (base) => {
    await setupAdmin(base);
    const res = await fetch(`${base}/__molenkopf/dev/revision`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not_found" });
  });
});
