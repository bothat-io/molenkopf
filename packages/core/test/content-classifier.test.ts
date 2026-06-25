import test from "node:test";
import assert from "node:assert/strict";
import { classifyContent } from "../src/compression/content-classifier.ts";

test("classifies common content kinds", () => {
  assert.equal(classifyContent('{"ok":true}'), "json");
  assert.equal(classifyContent("diff --git a/a b/a\n@@ -1 +1 @@"), "diff");
  assert.equal(classifyContent("Error: boom\n    at app (/srv/app.ts:12:4)"), "stacktrace");
  assert.equal(classifyContent("# Title\n- item"), "markdown");
  assert.equal(classifyContent("import x from 'y';\nexport function run() {}"), "source_code");
  assert.equal(classifyContent("[2026-01-01] ERROR failed\nline\nline"), "log");
  assert.equal(classifyContent("npm test\nFAIL suite\nexit code 1"), "shell_output");
});

test("does not classify long ordinary prose as log output", () => {
  const prose = Array.from({ length: 240 }, (_, i) => `This is specification paragraph ${i} with ordinary requirements and context.`).join("\n");
  assert.equal(classifyContent(prose), "plain_text");
});
