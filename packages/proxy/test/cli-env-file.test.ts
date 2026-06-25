import test from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile } from "../src/cli/env-file.ts";

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
