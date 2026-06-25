import test from "node:test";
import assert from "node:assert/strict";
import { executeCliProvider } from "../src/runtime/cli-executor.ts";

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
