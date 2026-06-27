import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { loadRuntimeSettings } from "../src/http/runtime-settings.ts";

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

test("runtime settings clean providers semantically and keep CLI fields", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-settings-providers-"));
  try {
    await writeFile(join(dataDir, "runtime-settings.json"), `${JSON.stringify({
      providers: [
        { id: "claude-local", name: "Claude Local", kind: "cli", target: "cli://claude-local", runtime: "claude", cliCommand: "claude", cliArgs: ["--print"], cliInputMode: "stdin", cliTimeoutMs: 120000, authScheme: "none", credentialRef: "none" },
        { id: "raw-secret", name: "Bad", kind: "api", target: "https://api.example.test/v1", credentialValue: "sk-secret" },
        { id: "private-api", name: "Bad", kind: "api", target: "http://127.0.0.1:11434/v1" },
        { id: "broken-cli", name: "Bad", kind: "cli", target: "cli://broken-cli" }
      ]
    })}\n`);
    const loaded = loadRuntimeSettings(dataDir);
    const providers = loaded.settings.providers ?? [];
    assert.match(loaded.warning ?? "", /invalid provider records/);
    assert.equal(providers.length, 1);
    assert.equal(providers[0].id, "claude-local");
    assert.equal(providers[0].runtime, "claude");
    assert.deepEqual(providers[0].cliArgs, ["--print"]);
    assert.equal((providers[0] as any).credentialValue, undefined);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
