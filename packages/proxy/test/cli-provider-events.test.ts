import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey, setupAdmin } from "./proxy-auth-utils.ts";

test("CLI providers publish safe step events for non-stream requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-events-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const controller = new AbortController();
  try {
    const script = join(dir, "fake-codex-events.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'Get-Secret sk-test-secret', status: 'in_progress' } }));",
      "  console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'npm run lint', status: 'in_progress' } }));",
      "  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'Get-Secret sk-test-secret', aggregated_output: 'secret output', status: 'completed' } }));",
      "  console.log(JSON.stringify({ type: 'result', result: 'done' }));",
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
    const cookie = await setupAdmin(base);
    const key = await issueKey(base, cookie, "cli-events");
    const eventResponse = await fetch(`${base}/__molenkopf/events`, { headers: { cookie }, signal: controller.signal });
    assert.equal(eventResponse.status, 200);
    const events = readUntil(eventResponse.body!.getReader(), /event: request_finished/, controller);

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ model: "codex-client-model", input: "hello" })
    });

    assert.equal(response.status, 200);
    assert.match(await response.text(), /done/);
    const text = await events;
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((item) => item.text());
    assert.match(text, /event: request_step/);
    assert.match(text, /command_execution in_progress/);
    assert.match(text, /command_execution in_progress - npm/);
    assert.match(latest, /cli_step:command_execution in_progress/);
    assert.match(latest, /cli_step:command_execution in_progress - npm/);
    assert.doesNotMatch(`${text}\n${latest}`, /run lint|Get-Secret|sk-test-secret|secret output|item\.started/);
  } finally {
    controller.abort();
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude CLI providers publish safe tool step events without tool input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-claude-events-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const controller = new AbortController();
  try {
    const script = join(dir, "fake-claude-events.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'tool_use', name: 'Bash', input: { command: 'echo sk-test-secret' } }));",
      "  console.log(JSON.stringify({ type: 'result', result: 'done' }));",
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
    const cookie = await setupAdmin(base);
    const key = await issueKey(base, cookie, "claude-events");
    const eventResponse = await fetch(`${base}/__molenkopf/events`, { headers: { cookie }, signal: controller.signal });
    const events = readUntil(eventResponse.body!.getReader(), /event: request_finished/, controller);

    const response = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ model: "claude-client-model", messages: [{ role: "user", content: "hello" }] })
    });

    assert.equal(response.status, 200);
    assert.match(await response.text(), /done/);
    const text = await events;
    assert.match(text, /event: request_step/);
    assert.match(text, /tool_use: Bash/);
    assert.doesNotMatch(text, /echo sk-test-secret|item\.started|tool input/);
  } finally {
    controller.abort();
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, done: RegExp, controller: AbortController): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value);
      if (done.test(text)) break;
    }
  } catch {}
  clearTimeout(timeout);
  return text;
}
