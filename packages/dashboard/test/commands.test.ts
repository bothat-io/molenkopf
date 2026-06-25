import test from "node:test";
import assert from "node:assert/strict";
import { connectLines } from "../src/features/keys/commands.ts";

test("connect command generation supports Claude and Codex in PowerShell", () => {
  assert.deepEqual(connectLines("claude", "powershell", "http://127.0.0.1:8787", "mk_secret"), [
    "$env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:8787'",
    "$env:ANTHROPIC_API_KEY = 'mk_secret'",
    "claude.cmd"
  ]);
  const codex = connectLines("codex", "powershell", "http://127.0.0.1:8787", "mk_secret");
  assert.equal(codex[0], "$env:OPENAI_API_KEY = 'mk_secret'");
  assert.match(codex[1], /codex\.cmd -c/);
  assert.match(codex[1], /model_provider=molenkopf/);
  assert.match(codex[1], /model_providers\.molenkopf\.base_url=http:\/\/127\.0\.0\.1:8787\/v1/);
  assert.doesNotMatch(codex.join("\n"), /Reply only OK/);
  assert.doesNotMatch(codex.join("\n"), /OPENAI_BASE_URL/);
});

test("other setup exposes OpenAI-compatible environment without a dummy request", () => {
  const cmd = connectLines("other", "cmd", "http://127.0.0.1:8787", "mk_secret").join("\n");
  assert.match(cmd, /OPENAI_BASE_URL=http:\/\/127\.0\.0\.1:8787\/v1/);
  assert.match(cmd, /OPENAI_API_KEY=mk_secret/);
  assert.doesNotMatch(cmd, /Reply only OK|curl|data-binary/);
});

test("connect command values are shell-quoted", () => {
  const ps = connectLines("claude", "powershell", "http://127.0.0.1:8787", "mk'a").join("\n");
  assert.match(ps, /\$env:ANTHROPIC_API_KEY = 'mk''a'/);

  const bash = connectLines("other", "bash", "http://127.0.0.1:8787", "mk'a").join("\n");
  assert.match(bash, /export OPENAI_API_KEY='mk'"'"'a'/);

  const cmd = connectLines("other", "cmd", "http://127.0.0.1:8787", "mk%a").join("\n");
  assert.match(cmd, /OPENAI_API_KEY=mk%%a/);
});
