import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
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
  assert.deepEqual(cliArgs(claudeProvider, "sonnet"), ["--print", "--no-session-persistence", "--output-format", "stream-json", "--include-partial-messages", "--model", "sonnet"]);
  assert.deepEqual(cliArgs(codexProvider, "gpt-5"), ["exec", "--ephemeral", "--json", "-m", "gpt-5"]);
});

test("imported Claude providers disable project settings and tools", () => {
  assert.deepEqual(cliArgs({
    ...claudeProvider,
    runtimeAuthDir: "runtime-auth/claude-work",
    cliArgs: [
      "--print",
      "--settings",
      "settings.json",
      "--permission-mode",
      "bypassPermissions",
      "--add-dir",
      "C:\\repo",
      "--allowedTools",
      "Bash(git *)",
      "--tools",
      "Read"
    ]
  }), [
    "--print",
    "--no-session-persistence",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--safe-mode",
    "--permission-mode",
    "plan",
    "--tools="
  ]);
});

test("imported Codex providers run in an isolated read-only workspace", () => {
  assert.deepEqual(cliArgs({ ...codexProvider, runtimeAuthDir: "runtime-auth/codex-work" }), [
    "exec",
    "--ephemeral",
    "--json",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    join("runtime-auth", "codex-work", "workspace")
  ]);
});

test("imported Codex providers respect explicit imported sandbox profiles", () => {
  assert.deepEqual(cliArgs({
    ...codexProvider,
    runtimeAuthDir: "runtime-auth/codex-work",
    runtimeProfile: { sandbox: "danger-full-access", approval: "never" },
    cliArgs: ["exec", "--sandbox", "danger-full-access", "-c", 'approval_policy="never"']
  }), [
    "exec",
    "-c",
    'approval_policy="never"',
    "--ephemeral",
    "--json",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "danger-full-access",
    "--cd",
    join("runtime-auth", "codex-work", "workspace")
  ]);
});
