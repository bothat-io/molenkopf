import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

const post = (base: string, path: string, body: unknown, cookie = "") =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

test("corrupt runtime settings are quarantined and surfaced", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-settings-corrupt-"));
  await writeFile(join(dataDir, "runtime-settings.json"), "{not json", "utf8");
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = cookieOf(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
    const status = await fetch(`${base}/__molenkopf/status`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.match(status.settingsLoadWarning, /runtime settings were corrupt/);
    const config = await fetch(`${base}/__molenkopf/config`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.match(config.settingsLoadWarning, /runtime settings were corrupt/);
    assert.ok((await readdir(dataDir)).some((name) => name.startsWith("runtime-settings.json.corrupt.")));
  } finally {
    await proxy.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
