import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, cookieOf, issueKey } from "./proxy-auth-utils.ts";

test("Codex CLI steps stream as ordered reasoning summary parts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-reasoning-progress-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-codex-reasoning.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'turn.started' }));",
      "  console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'npm install', status: 'in_progress' } }));",
      "  console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'npm test', status: 'in_progress' } }));",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'npm test', status: 'completed' } }));",
      "  console.log(JSON.stringify({ type: 'exec_command_begin', name: 'shell' }));",
      "  console.log(JSON.stringify({ type: 'agent_message_delta', delta: 'final answer' }));",
      "  console.log(JSON.stringify({ type: 'result', result: 'final answer' }));",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-local",
      providers: [{ id: "codex-local", name: "Codex Local", kind: "cli", target: "cli://codex-local", runtime: "codex", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin" }],
      activeProviderId: "codex-local",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) }));
    const key = await issueKey(base, admin, "cli-reasoning-progress");
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ stream: true, model: "codex-client-model", input: "hello stream" }) });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal((text.match(/event: response\.output_item\.added/g) ?? []).length, 2);
    assert.equal((text.match(/event: response\.reasoning_summary_part\.added/g) ?? []).length, 3);
    assert.match(text, /"summary_index":0/);
    assert.match(text, /"summary_index":1/);
    assert.match(text, /"summary_index":2/);
    assert.match(text, /\*\*Molenkopf: running command - npm\*\*/);
    assert.doesNotMatch(text, /npm install|npm test/);
    assert.doesNotMatch(text, /\*\*Molenkopf: turn\.started\*\*/);
    assert.doesNotMatch(text, /\*\*Molenkopf: command completed/);
    assert.ok(text.indexOf("event: response.output_item.done") < text.indexOf("event: response.output_text.delta"));
    assert.match(text, /"content":null/);
    assert.match(text, /"encrypted_content":null/);
    assert.doesNotMatch(text, /molenkopf_cli_step/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
