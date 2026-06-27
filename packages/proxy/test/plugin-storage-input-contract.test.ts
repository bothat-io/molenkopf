import test from "node:test";
import assert from "node:assert/strict";
import { safePluginStorageInput } from "../src/http/plugin-storage-safety.ts";

test("plugin storage input redacts secrets and forbidden content", () => {
  const result = safePluginStorageInput("context-compressor-plugin", "team", {
    api: "Bearer mk_1234567890123456789012",
    nested: { raw_prompt: "never-store" },
    ok: true
  });
  assert.equal(result.ok, false);
  const value = result.value as Record<string, unknown>;
  assert.equal((value.api as string).startsWith("[REDACTED_PLUGIN_STORAGE"), true);
  assert.equal((value.nested as Record<string, unknown>).raw_prompt, "[REDACTED_PLUGIN_STORAGE:context-compressor-plugin]");
  assert.equal((result.errors.includes("forbidden-storage-content")), true);
});

test("plugin storage input keeps safe primitive payloads", () => {
  const result = safePluginStorageInput("context-compressor-plugin", "global", { keep: "safe", limit: 8, list: [1, 2, 3] });
  assert.equal(result.ok, true);
  assert.equal((result.value as Record<string, unknown>).keep, "safe");
});
