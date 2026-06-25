import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("runtime provider test separates auth, model, and host permission state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-test-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const authDir = join(dir, "runtime-auth", "claude-ok");
    await mkdir(authDir, { recursive: true });
    const script = join(dir, "ok.cjs");
    await writeFile(script, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('OK'));\n");
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-ok",
      providers: [{ id: "claude-ok", name: "Claude OK", kind: "cli", target: "cli://claude-ok", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin", runtimeAuthDir: authDir }],
      activeProviderId: "claude-ok",
      providerCatalogMode: "explicit",
      dataDir: dir
    });

    const admin = await setupAdmin(proxy.port);
    const json = await postTest(proxy.port, "claude-ok", 200, admin);
    assert.equal(json.auth.status, "ok");
    assert.equal(json.model.status, "ok");
    assert.equal(json.permission.status, "unknown");
    assert.equal(json.lifecycle.state, "closed");
    assert.match(json.permission.message, /No host permission block/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime provider test does not echo local model output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-redact-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const authDir = join(dir, "runtime-auth", "codex-redact");
    await mkdir(authDir, { recursive: true });
    const script = join(dir, "secret-output.cjs");
    await writeFile(script, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('refresh_token=runtime-secret'));\n");
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-redact",
      providers: [{ id: "codex-redact", name: "Codex Redact", kind: "cli", target: "cli://codex-redact", runtime: "codex", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin", runtimeAuthDir: authDir }],
      activeProviderId: "codex-redact",
      providerCatalogMode: "explicit",
      dataDir: dir
    });

    const admin = await setupAdmin(proxy.port);
    const response = await fetch(`http://127.0.0.1:${proxy.port}/__molenkopf/providers/test-runtime`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ id: "codex-redact" })
    });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(text, /runtime-secret|refresh_token/);
    const json = JSON.parse(text);
    assert.equal(json.model.status, "ok");
    assert.equal(json.model.message, "Model produced a non-empty response");
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime provider test classifies Claude host permission blocks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-block-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "blocked.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  process.stderr.write(\"Claude requested permissions to write to .project-alpha-write-test.txt, but you haven't granted it yet.\");",
      "  process.exit(1);",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-blocked",
      providers: [{ id: "claude-blocked", name: "Claude Blocked", kind: "cli", target: "cli://claude-blocked", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin" }],
      activeProviderId: "claude-blocked",
      providerCatalogMode: "explicit",
      dataDir: dir
    });

    const admin = await setupAdmin(proxy.port);
    const json = await postTest(proxy.port, "claude-blocked", 502, admin);
    assert.equal(json.permission.status, "blocked");
    assert.equal(json.model.status, "failed");
    assert.equal(json.lifecycle.state, "closed");
    assert.match(json.permission.message, /permission prompt/);
    assert.doesNotMatch(json.permission.message, /project-alpha-write-test/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime provider test classifies local CLI auth failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-fail-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "auth-fail.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  process.stderr.write('Not logged in. Please run /login.');",
      "  process.exit(2);",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-auth-fail",
      providers: [{ id: "codex-auth-fail", name: "Codex Auth Fail", kind: "cli", target: "cli://codex-auth-fail", runtime: "codex", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin" }],
      activeProviderId: "codex-auth-fail",
      providerCatalogMode: "explicit",
      dataDir: dir
    });

    const admin = await setupAdmin(proxy.port);
    const json = await postTest(proxy.port, "codex-auth-fail", 502, admin);
    assert.equal(json.auth.status, "failed");
    assert.match(json.auth.message, /Local CLI authentication failed/);
    assert.equal(json.model.message, "CLI did not complete");
    assert.equal(json.lifecycle.state, "closed");
    assert.doesNotMatch(json.auth.message, /lifecycle|Not logged in/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime provider test exposes timeout lifecycle state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-timeout-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "hang.cjs");
    await writeFile(script, "process.stdin.resume(); setInterval(() => {}, 1000);\n");
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-timeout",
      providers: [{ id: "claude-timeout", name: "Claude Timeout", kind: "cli", target: "cli://claude-timeout", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin", cliTimeoutMs: 200 }],
      activeProviderId: "claude-timeout",
      providerCatalogMode: "explicit",
      dataDir: dir
    });

    const admin = await setupAdmin(proxy.port);
    const json = await postTest(proxy.port, "claude-timeout", 502, admin);
    assert.equal(json.lifecycle.state, "timeout");
    assert.match(json.model.message, /timed out after 200ms/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function setupAdmin(port: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/__molenkopf/setup-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin-secret" })
  });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function postTest(port: number, id: string, status: number, cookie: string): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${port}/__molenkopf/providers/test-runtime`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ id })
  });
  assert.equal(response.status, status);
  return response.json();
}
