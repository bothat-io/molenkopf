import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RetrievalStore } from "../src/store/retrieval-store.ts";
import { compressJsonBody } from "../src/pipeline/openai-request-rewriter.ts";

test("records protected source pressure without counting savings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "protected-source-"));
  const source = Array.from({ length: 180 }, (_, i) => `export function f${i}() { return ${i}; }`).join("\n");
  try {
    const result = await compressJsonBody(JSON.stringify({ input: source }), new RetrievalStore(dir), "req_source");
    assert.equal(result.compressedItems, 0);
    assert.equal(result.savedTokens, 0);
    assert.equal(result.skipReasons.source_code_not_compressed, 1);
    assert.equal(result.protectedSourceTokens > 0, true);
    assert.equal(result.protectedDiffTokens, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("records protected diff pressure without counting savings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "protected-diff-"));
  const diff = "diff --git a/app.ts b/app.ts\n@@ -1 +1 @@\n" + Array.from({ length: 220 }, (_, i) => `-old line ${i}\n+new line ${i}`).join("\n");
  try {
    const result = await compressJsonBody(JSON.stringify({ input: diff }), new RetrievalStore(dir), "req_diff");
    assert.equal(result.compressedItems, 0);
    assert.equal(result.savedTokens, 0);
    assert.equal(result.skipReasons.diff_not_compressed, 1);
    assert.equal(result.protectedDiffTokens > 0, true);
    assert.equal(result.protectedSourceTokens, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
