import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { installFakeClaude, installFakeCodex, postJson, runtimeProof, setupAdmin, withPath } from "./runtime-auth-test-utils.ts";

test("imports a supplied runtime auth JSON without exposing the secret", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  let restorePath = () => {};
  try {
    await installFakeCodex(dir);
    restorePath = withPath(dir);
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const authJson = JSON.stringify({ refresh_token: "codex-session-secret", account: "work" });
    const body = {
      id: "codex-work",
      name: "Codex Work",
      runtime: "codex",
      authJson,
      profile: { addDirs: ["C:\\example-secret-dir"] },
      profileText: 'sandbox_mode = "workspace-write"\napproval_policy = "never"\n',
      activate: true
    };
    const imported = await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, importProof: await runtimeProof(base, body, admin) }, admin);

    assert.equal(imported.status, 200);
    const importedJson = await imported.json();
    assert.equal(importedJson.imported.id, "codex-work");
    assert.equal(importedJson.imported.runtime, "codex");
    assert.equal(importedJson.imported.authRef, undefined);
    assert.deepEqual(importedJson.imported.profile.summary, ["Codex config", "sandbox workspace-write", "approval never", "1 add dirs"]);
    assert.doesNotMatch(JSON.stringify(importedJson), /codex-session-secret/);
    assert.doesNotMatch(JSON.stringify(importedJson), /runtime-auth:codex-work|cliArgs|example-secret-dir/);

    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const provider = providers.items.find((item: { id: string }) => item.id === "codex-work");
    assert.equal(provider.runtime, "codex");
    assert.equal(provider.runtimeAuthConfigured, true);
    assert.equal(provider.allowDistribution, true);
    assert.equal(provider.sharePercent, 100);
    assert.equal(provider.runtimeAuthDir, undefined);
    assert.equal(provider.authRef, undefined);
    assert.equal(provider.cliArgs, undefined);
    assert.deepEqual(provider.runtimeProfile.summary, ["Codex config", "sandbox workspace-write", "approval never", "1 add dirs"]);
    assert.doesNotMatch(JSON.stringify(providers), /codex-session-secret/);
    assert.doesNotMatch(JSON.stringify(providers), /runtime-auth:codex-work|example-secret-dir/);

    const stored = await readFile(join(dir, "runtime-auth", "codex-work", "auth.json"), "utf8");
    assert.match(stored, /codex-session-secret/);
    const storedConfig = await readFile(join(dir, "runtime-auth", "codex-work", "config.toml"), "utf8");
    assert.equal(storedConfig, 'sandbox_mode = "workspace-write"\napproval_policy = "never"');
  } finally {
    if (proxy) await proxy.close();
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude runtime auth import stores credentials where Claude Code reads them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  let restorePath = () => {};
  try {
    await installFakeClaude(dir);
    restorePath = withPath(dir);
    const admin = await setupAdmin(base);
    const authJson = JSON.stringify({ claudeAiOauth: { accessToken: "claude-oauth-secret" }, mcpOAuth: {} });
    const body = {
      id: "claude-work",
      runtime: "claude",
      authJson,
      profileText: JSON.stringify({ permissionMode: "auto", permissions: { allow: ["Bash(git status)"], deny: ["WebFetch"] } })
    };
    const imported = await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, importProof: await runtimeProof(base, body, admin) }, admin);

    assert.equal(imported.status, 200);
    const importedJson = await imported.json();
    assert.equal(importedJson.imported.id, "claude-work");
    assert.equal(importedJson.imported.runtime, "claude");
    assert.doesNotMatch(JSON.stringify(importedJson), /claude-oauth-secret/);
    assert.doesNotMatch(JSON.stringify(importedJson), /Bash\(git status\)|WebFetch|authRef|cliArgs/);

    const authDir = join(dir, "runtime-auth", "claude-work");
    const storedAuth = await readFile(join(authDir, "auth.json"), "utf8");
    const claudeCredentials = await readFile(join(authDir, ".credentials.json"), "utf8");
    const settings = JSON.parse(await readFile(join(authDir, "settings.json"), "utf8"));
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const provider = providers.items.find((item: { id: string }) => item.id === "claude-work");
    assert.deepEqual(provider.runtimeProfile.summary, ["Claude settings", "mode auto", "1 allowed tools", "1 denied tools"]);
    assert.equal(provider.authRef, undefined);
    assert.equal(provider.cliArgs, undefined);
    assert.equal(provider.runtimeProfile.allowedTools, undefined);
    assert.equal(provider.runtimeProfile.disallowedTools, undefined);
    assert.doesNotMatch(JSON.stringify(providers), /Bash\(git status\)|WebFetch/);
    assert.equal(settings.permissionMode, "auto");
    assert.deepEqual(JSON.parse(claudeCredentials), JSON.parse(authJson));
    assert.equal(claudeCredentials, storedAuth);
  } finally {
    await proxy.close();
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});

test("pasted auth JSON creates, selects, and tests an imported account without a manual id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-paste-"));
  let restorePath = () => {};
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await installFakeCodex(dir);
    restorePath = withPath(dir);
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const authJson = JSON.stringify({ refresh_token: "colleague-secret", account: "max-work" });
    const body = { runtime: "codex", authJson, activate: true };
    const imported = await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, importProof: await runtimeProof(base, body, admin) }, admin);

    assert.equal(imported.status, 200);
    const importedJson = await imported.json();
    assert.match(importedJson.imported.id, /^codex-import-[a-f0-9]{6}$/);
    assert.equal(importedJson.imported.authRef, undefined);
    assert.equal(importedJson.providers.activeProviderId, importedJson.imported.id);
    assert.equal(importedJson.providers.activeProvider.id, importedJson.imported.id);
    assert.equal(importedJson.providers.activeProvider.runtimeAuthConfigured, true);
    assert.doesNotMatch(JSON.stringify(importedJson), /colleague-secret/);

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "test imported account" })
    });
    assert.equal(response.status, 200);
    const responseJson = await response.json() as { output_text: string };
    assert.equal(responseJson.output_text, "imported max-work: test imported account");
  } finally {
    if (proxy) await proxy.close();
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects invalid runtime auth imports before registering a provider", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const badJson = await postJson(`${base}/__molenkopf/providers/import-auth`, { id: "bad", runtime: "codex", authJson: "{nope" }, admin);
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), { error: "invalid_auth_json" });

    const badRuntime = await postJson(`${base}/__molenkopf/providers/import-auth`, { id: "bad-runtime", runtime: "other", authJson: "{}" }, admin);
    assert.equal(badRuntime.status, 400);
    assert.deepEqual(await badRuntime.json(), { error: "invalid_runtime" });

    const badProfile = await postJson(`${base}/__molenkopf/providers/import-auth`, { id: "bad-profile", runtime: "claude", authJson: "{}", profileText: "{nope" }, admin);
    assert.equal(badProfile.status, 400);
    assert.deepEqual(await badProfile.json(), { error: "invalid_profile_json" });

    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.items.some((item: { id: string }) => item.id === "bad"), false);
    assert.equal(providers.items.some((item: { id: string }) => item.id === "bad-runtime"), false);
    assert.equal(providers.items.some((item: { id: string }) => item.id === "bad-profile"), false);
  } finally {
    await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
