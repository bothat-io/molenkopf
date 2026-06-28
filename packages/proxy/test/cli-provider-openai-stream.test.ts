import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, cookieOf, issueKey } from "./proxy-auth-utils.ts";

test("Codex CLI providers satisfy OpenAI Responses streaming clients", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-openai-stream-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-codex.cjs");
    await writeFile(script, [
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => setTimeout(() => process.stdout.write('stream echo: ' + input.trim()), 80));"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-local",
      providers: [{
        id: "codex-local",
        name: "Codex Local",
        kind: "cli",
        target: "cli://codex-local",
        runtime: "codex",
        cliCommand: process.execPath,
        cliArgs: [script],
        cliInputMode: "stdin"
      }],
      activeProviderId: "codex-local",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-openai-stream");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "codex-client-model", input: "hello stream" })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    assert.match(first, /event: response\.created/);
    assert.doesNotMatch(first, /stream echo: hello stream/);
    let text = first;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    assert.match(text, /event: response\.output_text\.delta/);
    assert.match(text, /stream echo: hello stream/);
    assert.match(text, /event: response\.completed/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Codex CLI JSON events stream visible steps and text deltas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-openai-json-stream-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-codex-json.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'exec_command_begin', name: 'shell' }));",
      "  console.log(JSON.stringify({ type: 'agent_message_delta', delta: 'part one ' }));",
      "  setTimeout(() => {",
      "    console.log(JSON.stringify({ type: 'agent_message_delta', delta: 'part two' }));",
      "    console.log(JSON.stringify({ type: 'result', result: 'part one part two' }));",
      "  }, 50);",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-local",
      providers: [{
        id: "codex-local",
        name: "Codex Local",
        kind: "cli",
        target: "cli://codex-local",
        runtime: "codex",
        cliCommand: process.execPath,
        cliArgs: [script],
        cliInputMode: "stdin"
      }],
      activeProviderId: "codex-local",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-openai-json-stream");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "codex-client-model", input: "hello stream" })
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /event: response\.in_progress/);
    assert.match(text, /molenkopf_cli_step/);
    assert.match(text, /exec_command_begin: shell/);
    assert.match(text, /event: response\.output_text\.delta/);
    assert.match(text, /part one /);
    assert.match(text, /part two/);
    assert.match(text, /event: response\.completed/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed Codex CLI streams still complete the OpenAI Responses stream", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-openai-failed-stream-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-codex-fail.cjs");
    await writeFile(script, [
      "process.stderr.write('local failure');",
      "process.stdin.resume();",
      "process.stdin.on('end', () => process.exit(1));"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-local",
      providers: [{
        id: "codex-local",
        name: "Codex Local",
        kind: "cli",
        target: "cli://codex-local",
        runtime: "codex",
        cliCommand: process.execPath,
        cliArgs: [script],
        cliInputMode: "stdin"
      }],
      activeProviderId: "codex-local",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-openai-failed-stream");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "codex-client-model", input: "fail stream" })
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Local CLI provider failed before producing a complete response/);
    assert.match(text, /event: response\.completed/);
    assert.doesNotMatch(text, /event: response\.failed/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("aborted OpenAI Responses streams stop the local CLI child", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-openai-abort-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const pidFile = join(dir, "child.pid");
    const script = join(dir, "fake-hang.cjs");
    await writeFile(script, [
      "const fs = require('fs');",
      `fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
      "process.stdin.resume();",
      "setInterval(() => {}, 1000);"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-local",
      providers: [{
        id: "codex-local",
        name: "Codex Local",
        kind: "cli",
        target: "cli://codex-local",
        runtime: "codex",
        cliCommand: process.execPath,
        cliArgs: [script],
        cliInputMode: "stdin",
        cliTimeoutMs: 30000
      }],
      activeProviderId: "codex-local",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-openai-abort");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "codex-client-model", input: "hang" })
    });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    await reader.read();
    const pid = Number(await waitForFile(pidFile));

    await reader.cancel();

    await waitForExit(pid);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 3000;
  for (;;) {
    try { return await readFile(path, "utf8"); } catch {}
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await delay(50);
  }
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  for (;;) {
    try { process.kill(pid, 0); } catch { return; }
    if (Date.now() > deadline) throw new Error(`process ${pid} did not exit`);
    await delay(50);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
