import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeState } from "../src/http/runtime-state.ts";
import { removeProvider, selectProvider, updateProvider } from "../src/http/local-api-provider-actions.ts";
import { persistRuntimeSettings } from "../src/http/runtime-settings.ts";

test("runtime-auth provider removal preserves auth files when settings persist fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-remove-fail-"));
  const badDataDir = join(dir, "not-a-dir");
  const authDir = join(dir, "runtime-auth", "claude-fail");
  await writeFile(badDataDir, "file");
  await mkdir(authDir, { recursive: true });
  await writeFile(join(authDir, "auth.json"), "{}\n");
  const state = createRuntimeState({
    target: "http://127.0.0.1:9/v1",
    dataDir: badDataDir,
    providers: [{ id: "claude-fail", name: "Claude Fail", kind: "cli", target: "cli://claude-fail", runtime: "claude", cliCommand: "claude", cliArgs: ["--print"], cliInputMode: "stdin", authScheme: "none", credentialRef: "none", runtimeAuthDir: authDir }]
  }, "127.0.0.1");

  const result = await call((req, res) => removeProvider(req, res, state), { id: "claude-fail" });
  assert.equal(result.status, 500);
  assert.equal(result.json.error, "persist_failed");
  assert.equal(existsSync(authDir), true);
  assert.equal(state.providers.some((provider) => provider.id === "claude-fail"), true);
  await rm(dir, { recursive: true, force: true });
});

test("provider selection restores runtime settings when runtime-auth state write fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-routing-atomic-"));
  const state = createRuntimeState({
    target: "http://127.0.0.1:9/v1",
    dataDir: dir,
    providers: [{ id: "backup", name: "Backup", kind: "local", target: "http://127.0.0.1:10/v1", authScheme: "none" }]
  }, "127.0.0.1");
  await persistRuntimeSettings(state);
  await writeFile(join(dir, "runtime-auth"), "not-a-directory");

  const result = await call((req, res) => selectProvider(req, res, state), { id: "backup" });
  assert.equal(result.status, 500);
  assert.equal(result.json.error, "persist_failed");
  assert.equal(state.activeProviderId, "default");
  const settings = JSON.parse(await readFile(join(dir, "runtime-settings.json"), "utf8"));
  assert.equal(settings.activeProviderId, "default");
  await rm(dir, { recursive: true, force: true });
});

test("provider update restores runtime settings after late runtime-auth metadata failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-update-fail-"));
  const runtimeRoot = join(dir, "runtime-auth");
  const authPath = join(runtimeRoot, "claude-fail");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(authPath, "not-a-directory");
  const state = createRuntimeState({
    target: "http://127.0.0.1:9/v1",
    dataDir: dir,
    activeProviderId: "claude-fail",
    providers: [{
      id: "claude-fail", name: "Claude Fail", kind: "cli", target: "cli://claude-fail",
      runtime: "claude", cliCommand: "claude", cliArgs: ["--print"], cliInputMode: "stdin",
      authScheme: "none", credentialRef: "none", runtimeAuthDir: authPath, enabled: true
    }]
  }, "127.0.0.1");
  await persistRuntimeSettings(state);

  const result = await call((req, res) => updateProvider(req, res, state), { id: "claude-fail", enabled: false });
  assert.equal(result.status, 500);
  assert.equal(result.json.error, "persist_failed");
  assert.equal(state.activeProviderId, "claude-fail");
  assert.equal(state.providers.find((provider) => provider.id === "claude-fail")?.enabled, true);
  const settings = JSON.parse(await readFile(join(dir, "runtime-settings.json"), "utf8"));
  assert.equal(settings.activeProviderId, "claude-fail");
  await rm(dir, { recursive: true, force: true });
});

async function call(handler: (req: any, res: any) => Promise<void>, body: unknown): Promise<{ status: number; json: any }> {
  const server = createServer((req, res) => { void handler(req, res); });
  const port = await listenOn(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  } finally {
    server.close();
  }
}

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
