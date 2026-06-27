import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefaultEnvFile, loadEnvFile, parseEnvFile } from "../src/cli/env-file.ts";

test("parses molenkopf env files without echoing secrets", () => {
  const parsed = parseEnvFile(`
# local only
OPENAI_API_KEY="sk-test"
MOLENKOPF_PROVIDER_IDS=openai-main,claude-main
MOLENKOPF_PROVIDER_CLAUDE_MAIN_AUTH=x-api-key
bad-key=ignored
`);

  assert.equal(parsed.OPENAI_API_KEY, "sk-test");
  assert.equal(parsed.MOLENKOPF_PROVIDER_IDS, "openai-main,claude-main");
  assert.equal(parsed.MOLENKOPF_PROVIDER_CLAUDE_MAIN_AUTH, "x-api-key");
  assert.equal(parsed["bad-key"], undefined);
});

test("env file loading does not overwrite existing environment values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-env-file-"));
  const file = join(dir, "custom.env");
  const env: Record<string, string | undefined> = { EXISTING_KEY: "shell", ONLY_SHELL: "keep" };
  try {
    await writeFile(file, "EXISTING_KEY=file\nFILE_ONLY=value\n", "utf8");
    await loadEnvFile(file, env);
    assert.equal(env.EXISTING_KEY, "shell");
    assert.equal(env.ONLY_SHELL, "keep");
    assert.equal(env.FILE_ONLY, "value");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("default .env fills only missing values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-dotenv-"));
  const env: Record<string, string | undefined> = { MOLENKOPF_SESSION_SECRET: "from-shell" };
  try {
    await writeFile(join(dir, ".env"), "MOLENKOPF_SESSION_SECRET=from-file\nOPENAI_API_KEY=sk-test\n", "utf8");
    assert.equal(loadDefaultEnvFile(dir, env), true);
    assert.equal(env.MOLENKOPF_SESSION_SECRET, "from-shell");
    assert.equal(env.OPENAI_API_KEY, "sk-test");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
