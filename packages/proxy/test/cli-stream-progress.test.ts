import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, cookieOf, issueKey } from "./proxy-auth-utils.ts";

test("Codex CLI streams progress while long commands are still running", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-progress-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-long-codex.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  setTimeout(() => process.stdout.write('done after work'), 2300);",
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
    const admin = cookieOf(await fetch(`${base}/__molenkopf/setup-admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-secret" })
    }));
    const key = await issueKey(base, admin, "cli-progress");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ stream: true, model: "codex-client-model", input: "long work" })
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    const progressEvents = text.match(/event: response\.in_progress/g) ?? [];
    assert.ok(progressEvents.length >= 2, "long-running CLI streams should keep progress visible");
    assert.match(text, /done after work/);
    assert.match(text, /data: \[DONE\]/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
