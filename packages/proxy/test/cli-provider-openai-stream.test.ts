import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

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

    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
