import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    assert.match(text, /event: response\.reasoning_summary_text\.delta/);
    assert.doesNotMatch(text, /molenkopf_cli_step/);
    assert.match(text, /Molenkopf: running command/);
    assert.doesNotMatch(text, /exec_command_begin: shell/);
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

test("Codex CLI item events stream assistant text without raw JSONL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-openai-item-stream-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-codex-items.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }));",
      "  console.log(JSON.stringify({ type: 'turn.started' }));",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'first assistant text' } }));",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: 'second assistant text' } }));",
      "  console.log(JSON.stringify({ type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'Get-Secret sk-test-secret', status: 'in_progress' } }));",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: 'Get-Secret sk-test-secret', aggregated_output: 'secret output', exit_code: 0, status: 'completed' } }));",
      "  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2, cached_input_tokens: 8, reasoning_output_tokens: 1 } }));",
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
    const key = await issueKey(base, admin, "cli-openai-item-stream");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "codex-client-model", input: "hello stream" })
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /first assistant text/);
    assert.match(text, /first assistant text\\n\\nsecond assistant text/);
    assert.match(text, /event: response\.completed/);
    assert.match(text, /"input_tokens":10/);
    assert.match(text, /"output_tokens":2/);
    assert.match(text, /"input_tokens_details":\{"cached_tokens":8\}/);
    assert.match(text, /"output_tokens_details":\{"reasoning_tokens":1\}/);
    assert.doesNotMatch(text, /thread\.started/);
    assert.doesNotMatch(text, /item\.completed/);
    assert.doesNotMatch(text, /Get-Secret/);
    assert.doesNotMatch(text, /sk-test-secret/);
    assert.doesNotMatch(text, /secret output/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
