import test from "node:test";
import assert from "node:assert/strict";
import { cliArgs, cliRequest } from "../src/runtime/cli-request.ts";
import type { ProviderConfig } from "../../core/src/providers/provider-catalog.ts";

const claudeProvider: ProviderConfig = {
  id: "claude-import-4185b9",
  name: "Claude imported",
  kind: "cli",
  target: "cli://claude-import-4185b9",
  runtime: "claude",
  cliArgs: ["--print"],
  cliInputMode: "stdin"
};

const codexProvider: ProviderConfig = {
  id: "codex-import-4185b9",
  name: "Codex imported",
  kind: "cli",
  target: "cli://codex-import-4185b9",
  runtime: "codex",
  cliArgs: ["exec"],
  cliInputMode: "stdin"
};

test("CLI request models use runtime defaults when the client omits a model", () => {
  const request = cliRequest(JSON.stringify({ input: "hello" }), claudeProvider);
  assert.equal(request.prompt, "hello");
  assert.equal(request.responseModel, "sonnet");
  assert.equal(request.runModel, undefined);
});

test("CLI request models preserve real client model choices", () => {
  const request = cliRequest(JSON.stringify({ model: "claude-client-model", input: "hello" }), claudeProvider);
  assert.equal(request.responseModel, "claude-client-model");
  assert.equal(request.runModel, "claude-client-model");
});

test("CLI args make Claude and Codex runs ephemeral and model-aware", () => {
  assert.deepEqual(cliArgs(claudeProvider, "sonnet"), ["--print", "--no-session-persistence", "--model", "sonnet"]);
  assert.deepEqual(cliArgs(codexProvider, "gpt-5"), ["exec", "--ephemeral", "-m", "gpt-5"]);
});

test("imported Codex providers ignore user config files", () => {
  assert.deepEqual(cliArgs({ ...codexProvider, runtimeAuthDir: "runtime-auth/codex-work" }), ["exec", "--ephemeral", "--ignore-user-config"]);
});
