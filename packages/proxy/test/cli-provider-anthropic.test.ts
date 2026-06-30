import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, cookieOf, issueKey } from "./proxy-auth-utils.ts";
import { waitForExit, waitForFile } from "./cli-process-utils.ts";

test("Claude CLI providers answer Anthropic messages with Anthropic JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-anthropic-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-claude.cjs");
    await writeFile(script, [
      "process.stdin.setEncoding('utf8');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => input += chunk);",
      "process.stdin.on('end', () => process.stdout.write('anthropic echo: ' + input.trim()));"
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
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-anthropic");
    const response = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ model: "claude-client-model", messages: [{ role: "user", content: [{ type: "text", text: "hello claude" }] }] })
    });
    assert.equal(response.status, 200);
    const json = await response.json() as { type: string; role: string; model: string; content: { type: string; text: string }[]; usage: { input_tokens: number; output_tokens: number } };
    assert.equal(json.type, "message");
    assert.equal(json.role, "assistant");
    assert.equal(json.model, "claude-client-model");
    assert.equal(json.content[0]?.type, "text");
    assert.equal(json.content[0]?.text, "anthropic echo: hello claude");
    assert.ok(json.usage.input_tokens > 0);
    assert.ok(json.usage.output_tokens > 0);

    const stream = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "claude-stream-model", messages: [{ role: "user", content: "hello stream" }] })
    });
    assert.equal(stream.headers.get("content-type"), "text/event-stream");
    const text = await stream.text();
    assert.match(text, /event: message_start/);
    assert.match(text, /"model":"claude-stream-model"/);
    assert.match(text, /event: content_block_delta/);
    assert.match(text, /anthropic echo: hello stream/);
    assert.match(text, /event: message_stop/);
    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    const usage = providers.items.find((item: any) => item.id === "claude-work")?.usage;
    assert.ok(usage.inputTokens > 0, "CLI estimated input tokens are counted");
    assert.ok(usage.outputTokens > 0, "CLI estimated output tokens are counted");
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude CLI stream-json events stream visible steps and text deltas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-anthropic-json-stream-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-claude-json.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'tool_use', name: 'Read' }));",
      "  console.log(JSON.stringify({ type: 'content_block_delta', delta: { text: 'alpha ' } }));",
      "  console.log(JSON.stringify({ type: 'content_block_delta', delta: { text: 'beta' } }));",
      "  console.log(JSON.stringify({ type: 'result', usage: { input_tokens: 30, output_tokens: 9, cache_read_input_tokens: 20 }, result: 'alpha beta' }));",
      "});"
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
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-anthropic-json-stream");
    const stream = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "claude-stream-model", messages: [{ role: "user", content: "hello stream" }] })
    });

    assert.equal(stream.status, 200);
    assert.equal(stream.headers.get("content-type"), "text/event-stream");
    const text = await stream.text();
    assert.match(text, /event: ping/);
    assert.match(text, /molenkopf_cli_step/);
    assert.match(text, /using Read/);
    assert.doesNotMatch(text, /tool_use: Read/);
    assert.match(text, /event: content_block_delta/);
    assert.match(text, /alpha /);
    assert.match(text, /beta/);
    assert.match(text, /event: message_stop/);
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json() as Promise<any>);
    assert.equal(latest.upstreamInputTokens, 30);
    assert.equal(latest.upstreamOutputTokens, 9);
    assert.equal(latest.cacheReadTokens, 20);
    assert.equal(latest.usageSource, "cli_event");
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("aborted Anthropic message streams stop the local Claude child", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-anthropic-abort-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const pidFile = join(dir, "child.pid");
    const script = join(dir, "fake-claude-hang.cjs");
    await writeFile(script, [
      "const fs = require('fs');",
      `fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
      "process.stdin.resume();",
      "setInterval(() => {}, 1000);"
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
        cliInputMode: "stdin",
        cliTimeoutMs: 30000
      }],
      activeProviderId: "claude-work",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-anthropic-abort");
    const abort = new AbortController();
    const pending = fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "claude-stream-model", messages: [{ role: "user", content: "hang" }] }),
      signal: abort.signal
    }).catch((error) => error);

    const pid = Number(await waitForFile(pidFile));
    abort.abort();

    await waitForExit(pid);
    await pending;
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
