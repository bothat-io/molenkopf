import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCliProvider } from "../src/runtime/cli-executor.ts";

test("CLI provider returns final output and collected usage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-executor-"));
  try {
    const script = join(dir, "fake-codex.cjs");
    await writeFile(script, "console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 3, cached_input_tokens: 7, reasoning_output_tokens: 2 }, result: 'done' }));\n");
    const result = await executeCliProvider({
      id: "node-usage",
      name: "Node usage",
      kind: "cli",
      target: "cli://node-usage",
      runtime: "codex",
      cliCommand: process.execPath,
      cliArgs: [script],
      authScheme: "none",
      cliTimeoutMs: 5000
    }, "{}");
    assert.deepEqual(result, {
      output: "done",
      usage: { inputTokens: 12, outputTokens: 3, cachedTokens: 7, reasoningTokens: 2, source: "cli_event" }
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI provider output is capped and classified as overflow", async () => {
  const previous = process.env.MOLENKOPF_CLI_OUTPUT_LIMIT_BYTES;
  process.env.MOLENKOPF_CLI_OUTPUT_LIMIT_BYTES = "16";
  try {
    await assert.rejects(
      executeCliProvider({
        id: "node-overflow",
        name: "Node overflow",
        kind: "cli",
        target: "cli://node-overflow",
        runtime: "codex",
        cliCommand: process.execPath,
        cliArgs: ["-e", "process.stdout.write('x'.repeat(100))"],
        authScheme: "none",
        cliTimeoutMs: 5000
      }, "{}"),
      /output exceeded 16 bytes.*output_class:overflow/
    );
  } finally {
    if (previous === undefined) delete process.env.MOLENKOPF_CLI_OUTPUT_LIMIT_BYTES;
    else process.env.MOLENKOPF_CLI_OUTPUT_LIMIT_BYTES = previous;
  }
});
