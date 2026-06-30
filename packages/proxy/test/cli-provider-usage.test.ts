import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey, setupAdmin } from "./proxy-auth-utils.ts";

test("Codex CLI JSONL usage reaches OpenAI response and audit manifest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-usage-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "fake-codex-usage.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 123, output_tokens: 45, cached_input_tokens: 100, reasoning_output_tokens: 11 }, result: 'usage answer' }));",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-usage",
      providers: [{
        id: "codex-usage",
        name: "Codex Usage",
        kind: "cli",
        target: "cli://codex-usage",
        runtime: "codex",
        cliCommand: process.execPath,
        cliArgs: [script],
        cliInputMode: "stdin"
      }],
      activeProviderId: "codex-usage",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "cli-usage");

    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "application/json" }),
      body: JSON.stringify({ model: "codex-client-model", input: "hello usage" })
    });
    assert.equal(response.status, 200);
    const json = await response.json() as any;
    assert.equal(json.output_text, "usage answer");
    assert.equal(json.usage.input_tokens, 123);
    assert.equal(json.usage.output_tokens, 45);
    assert.equal(json.usage.input_tokens_details.cached_tokens, 100);
    assert.equal(json.usage.output_tokens_details.reasoning_tokens, 11);

    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie: admin } }).then((r) => r.json() as Promise<any>);
    assert.equal(latest.upstreamInputTokens, 123);
    assert.equal(latest.upstreamOutputTokens, 45);
    assert.equal(latest.cachedTokens, 100);
    assert.equal(latest.reasoningTokens, 11);
    assert.equal(latest.usageSource, "cli_event");
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
