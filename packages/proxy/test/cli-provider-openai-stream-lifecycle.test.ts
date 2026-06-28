import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, cookieOf, issueKey } from "./proxy-auth-utils.ts";
import { waitForExit, waitForFile } from "./cli-process-utils.ts";

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
