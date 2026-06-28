import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, setupKey } from "./proxy-auth-utils.ts";

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
      "  const isolated = process.cwd() === path.join(process.env.CODEX_HOME, 'workspace');",
      "  process.stdout.write('fake codex ' + auth.account + ' isolated=' + isolated + ': ' + input.trim());",
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
    assert.equal(responseJson.output_text, "fake codex work isolated=true: hello imported session");
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude CLI providers receive imported auth and run in an isolated workspace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-claude-auth-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const authDir = join(dir, "runtime-auth", "claude-work");
    await mkdir(authDir, { recursive: true });
    await writeFile(join(authDir, ".credentials.json"), JSON.stringify({ account: "work" }));
    const script = join(dir, "fake-claude.cjs");
    await writeFile(script, [
      "const fs = require('fs');",
      "const path = require('path');",
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => {",
      "  const auth = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, '.credentials.json'), 'utf8'));",
      "  const isolated = process.cwd() === path.join(process.env.CLAUDE_CONFIG_DIR, 'workspace');",
      "  process.stdout.write('fake claude ' + auth.account + ' isolated=' + isolated + ': ' + input.trim());",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-work",
      providers: [{ id: "claude-work", name: "Claude Work", kind: "cli", target: "cli://claude-work", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin", runtimeAuthDir: authDir }],
      activeProviderId: "claude-work",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "claude-auth");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ input: "hello imported session" })
    });
    assert.equal(response.status, 200);
    const responseJson = await response.json() as { output_text: string };
    assert.equal(responseJson.output_text, "fake claude work isolated=true: hello imported session");
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
