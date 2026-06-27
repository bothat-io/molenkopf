import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProxyConfig } from "../src/cli/config-loader.ts";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey, setupAdmin, setupKey } from "./proxy-auth-utils.ts";

test("JSON cli-claude provider executes a local CLI without auditing prompts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-provider-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-claude.cjs");
    await writeFile(script, [
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => process.stdout.write('fake claude: ' + input.trim()));"
    ].join("\n"));
    const configFile = join(dir, "molenkopf.config.json");
    await writeFile(configFile, JSON.stringify({
      schemaVersion: 1,
      providers: [{
        id: "claude-local",
        name: "Claude Local",
        kind: "cli-claude",
        command: process.execPath,
        args: [script],
        inputMode: "stdin",
        timeoutMs: 30000
      }],
      profiles: [{ id: "local-claude", providerId: "claude-local" }]
    }));
    const loaded = await loadProxyConfig(new Map([["config", configFile]]), {}, dir);
    const config = loaded.config!;
    proxy = await startProxy({
      port: 0,
      target: config.target,
      providers: config.providers,
      activeProviderId: config.activeProviderId,
      providerCatalogMode: "explicit",
      dataDir: dir,
      configSource: { kind: "file", path: "molenkopf.config.json" }
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "cli-claude");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ model: "claude-client-model", input: "hello local claude" })
    });
    assert.equal(response.status, 200);
    const responseJson = await response.json() as { model: string; output_text: string };
    assert.equal(responseJson.model, "claude-client-model");
    assert.equal(responseJson.output_text, "fake claude: hello local claude");

    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(latest.targetHost, "claude-local");
    assert.doesNotMatch(JSON.stringify(latest), /hello local claude/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows command shims are resolved for local Claude providers", async (t) => {
  if (process.platform !== "win32") return t.skip("Windows shim behavior");
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-shim-"));
  const originalPath = process.env.PATH;
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-claude.cjs");
    await writeFile(script, [
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => process.stdout.write('cmd shim: ' + input.trim()));"
    ].join("\n"));
    await writeFile(join(dir, "fake-claude.cmd"), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    process.env.PATH = `${dir};${originalPath ?? ""}`;
    const configFile = join(dir, "molenkopf.config.json");
    await writeFile(configFile, JSON.stringify({
      schemaVersion: 1,
      providers: [{ id: "claude-local", kind: "cli-claude", command: "fake-claude", args: [], inputMode: "stdin" }]
    }));
    const config = (await loadProxyConfig(new Map([["config", configFile]]), {}, dir)).config!;
    proxy = await startProxy({ port: 0, target: config.target, providers: config.providers, activeProviderId: config.activeProviderId, providerCatalogMode: "explicit", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "cli-shim");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ input: "hello from shim" })
    });
    assert.equal(response.status, 200);
    const responseJson = await response.json() as { output_text: string };
    assert.equal(responseJson.output_text, "cmd shim: hello from shim");
  } finally {
    if (proxy) await proxy.close();
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test("Codex CLI providers receive the imported auth directory as CODEX_HOME", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-codex-auth-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const authDir = join(dir, "runtime-auth", "codex-work");
    await mkdir(authDir, { recursive: true });
    await writeFile(join(authDir, "auth.json"), JSON.stringify({ account: "work" }));
    const script = join(dir, "fake-codex.cjs");
    await writeFile(script, [
      "const fs = require('fs');",
      "const path = require('path');",
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => {",
      "  const auth = JSON.parse(fs.readFileSync(path.join(process.env.CODEX_HOME, 'auth.json'), 'utf8'));",
      "  process.stdout.write('fake codex ' + auth.account + ': ' + input.trim());",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-work",
      providers: [{ id: "codex-work", name: "Codex Work", kind: "cli", target: "cli://codex-work", runtime: "codex", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin", runtimeAuthDir: authDir }],
      activeProviderId: "codex-work",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "codex-auth");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ input: "hello imported session" })
    });
    assert.equal(response.status, 200);
    const responseJson = await response.json() as { output_text: string };
    assert.equal(responseJson.output_text, "fake codex work: hello imported session");
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI provider errors return stable client errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-error-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-error.cjs");
    await writeFile(script, [
      "process.stdout.write('Not logged in - Please run /login');",
      "process.stderr.write('token=' + 'sk-ant-' + 'abcdefghijklmnopqrstuvwxyz1234567890');",
      "process.exit(1);"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-work",
      providers: [{
        id: "claude-work",
        name: "Claude Work",
        kind: "cli",
        target: "cli://claude-work",
        runtime: "claude",
        cliCommand: process.execPath,
        cliArgs: [script],
        cliInputMode: "stdin"
      }],
      activeProviderId: "claude-work",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "cli-error");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ input: "test" })
    });
    assert.equal(response.status, 502);
    const responseJson = await response.json() as { error: string; requestId: string };
    assert.equal(responseJson.error, "proxy_error");
    assert.match(responseJson.requestId, /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(responseJson), /Not logged in|REDACTED_SECRET|sk-ant-/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
