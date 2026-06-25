import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { installFakeClaude, installFakeCodex, postJson, runtimeProof, setupAdmin, withPath } from "./runtime-auth-test-utils.ts";

test("runtime auth imports survive a proxy restart without exposing secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-persist-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  let restorePath = () => {};
  try {
    await installFakeCodex(dir);
    restorePath = withPath(dir);
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    let base = `http://127.0.0.1:${proxy.port}`;
    let admin = await setupAdmin(base);
    const authJson = JSON.stringify({ refresh_token: "persist-secret", account: "restart-work" });
    const body = { id: "codex-restart", runtime: "codex", name: "Codex Restart", authJson };
    const imported = await fetch(`${base}/__molenkopf/providers/import-auth`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ ...body, importProof: await runtimeProof(base, body, admin) })
    });
    assert.equal(imported.status, 200);
    await proxy.close();

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    base = `http://127.0.0.1:${proxy.port}`;
    admin = await loginAdmin(base);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.activeProviderId, "codex-restart");
    const provider = providers.items.find((item: { id: string }) => item.id === "codex-restart");
    assert.equal(provider.name, "Codex Restart");
    assert.equal(provider.runtime, "codex");
    assert.equal(provider.runtimeAuthConfigured, true);
    assert.doesNotMatch(JSON.stringify(providers), /persist-secret/);
  } finally {
    if (proxy) await proxy.close().catch(() => {});
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});

test("activated runtime import updates restart settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-active-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  let restorePath = () => {};
  try {
    await installFakeCodex(dir);
    restorePath = withPath(dir);
    await writeFile(join(dir, "runtime-settings.json"), `${JSON.stringify({ activeProviderId: "default", routingMode: "manual" })}\n`);
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    let base = `http://127.0.0.1:${proxy.port}`;
    let admin = await setupAdmin(base);
    const body = { id: "codex-active", runtime: "codex", authJson: "{}" };
    const imported = await fetch(`${base}/__molenkopf/providers/import-auth`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ ...body, importProof: await runtimeProof(base, body, admin) })
    });
    assert.equal(imported.status, 200);
    await proxy.close();

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    base = `http://127.0.0.1:${proxy.port}`;
    admin = await loginAdmin(base);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.activeProviderId, "codex-active");
  } finally {
    if (proxy) await proxy.close().catch(() => {});
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime auth registry ignores invalid metadata files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-invalid-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const authDir = join(dir, "runtime-auth", "claude-invalid");
    await mkdir(authDir, { recursive: true });
    await writeFile(join(authDir, "auth.json"), "{}\n");
    await writeFile(join(authDir, ".credentials.json"), "{}\n");
    await writeFile(join(authDir, "provider.json"), `\uFEFF${JSON.stringify({ id: "claude-invalid", name: "Claude Invalid", runtime: "claude", authRef: "runtime-auth:claude-invalid:test" })}\n`);
    await writeFile(join(dir, "runtime-auth", "state.json"), `${JSON.stringify({ activeProviderId: "claude-invalid", routingMode: "manual" })}\n`);

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.items.some((item: { id: string }) => item.id === "claude-invalid"), false);
    assert.notEqual(providers.activeProviderId, "claude-invalid");
  } finally {
    if (proxy) await proxy.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test("restored runtime auth metadata is sanitized in provider views", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-safe-view-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const authDir = join(dir, "runtime-auth", "claude-safe");
    await mkdir(authDir, { recursive: true });
    await writeFile(join(authDir, "auth.json"), "{\"token\":\"stored-secret\"}\n");
    await writeFile(join(authDir, ".credentials.json"), "{\"token\":\"stored-secret\"}\n");
    await writeFile(join(authDir, "provider.json"), `${JSON.stringify({
      id: "claude-safe",
      name: "Claude Safe",
      runtime: "claude",
      authRef: "runtime-auth:claude-safe:fingerprint",
      runtimeProfile: { settingsRef: "settings.json", allowedTools: ["Bash(secret)"], addDirs: ["C:\\secret-dir"], summary: ["Claude settings", "1 allowed tools", "1 add dirs"] }
    })}\n`);

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const provider = providers.items.find((item: { id: string }) => item.id === "claude-safe");
    assert.equal(provider.runtimeAuthConfigured, true);
    assert.deepEqual(provider.runtimeProfile.summary, ["Claude settings", "1 allowed tools", "1 add dirs"]);
    assert.equal(provider.runtimeProfile.diagnostics.allowedToolCount, 1);
    assert.equal(provider.runtimeProfile.diagnostics.addDirCount, 1);
    assert.equal(provider.runtimeProfile.diagnostics.outerHarness, "unknown");
    assert.equal(provider.authRef, undefined);
    assert.equal(provider.cliArgs, undefined);
    assert.doesNotMatch(JSON.stringify(providers), /fingerprint|stored-secret|Bash\(secret\)|secret-dir/);
  } finally {
    if (proxy) await proxy.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test("removing an imported runtime provider deletes its persisted auth profile", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-remove-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  let restorePath = () => {};
  try {
    await installFakeClaude(dir);
    restorePath = withPath(dir);
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    let base = `http://127.0.0.1:${proxy.port}`;
    let admin = await setupAdmin(base);
    const body = { id: "claude-remove", runtime: "claude", name: "Claude Remove", authJson: "{}" };
    const imported = await fetch(`${base}/__molenkopf/providers/import-auth`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ ...body, importProof: await runtimeProof(base, body, admin) })
    });
    assert.equal(imported.status, 200);
    const authDir = join(dir, "runtime-auth", "claude-remove");
    assert.equal(existsSync(authDir), true);

    const removed = await fetch(`${base}/__molenkopf/providers/remove`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ id: "claude-remove" })
    });
    assert.equal(removed.status, 200);
    assert.equal(existsSync(authDir), false);
    await proxy.close();

    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    base = `http://127.0.0.1:${proxy.port}`;
    admin = await loginAdmin(base);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.items.some((item: { id: string }) => item.id === "claude-remove"), false);
  } finally {
    if (proxy) await proxy.close().catch(() => {});
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});

async function loginAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/login`, { username: "admin", password: "admin-secret" });
  assert.equal(response.status, 200);
  return (response.headers.get("set-cookie") || "").split(";")[0];
}
