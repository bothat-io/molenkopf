import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compressJsonBody } from "../src/pipeline/openai-request-rewriter.ts";
import { RetrievalStore } from "../src/store/retrieval-store.ts";

class CountingRetrievalStore extends RetrievalStore {
  saves = 0;

  override async save(text: string, meta: Parameters<RetrievalStore["save"]>[1]): ReturnType<RetrievalStore["save"]> {
    this.saves += 1;
    return super.save(text, meta);
  }
}

const safeFixtures = [
  ["npm test output", npmTestOutput()],
  ["TypeScript build output", tscOutput()],
  ["stack trace", stackTrace()],
  ["shell transcript", shellTranscript()],
  ["embedded JSON", embeddedJson()],
  ["markdown fenced output", markdownOutput()]
] as const;

for (const [name, content] of safeFixtures) {
  test(`compresses safe coding-agent ${name} in transform mode`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "compress-fixture-"));
    const store = new CountingRetrievalStore(dir);
    try {
      const body = openAiBody(content);
      const result = await compressJsonBody(body, store, `req_${name.replace(/\W+/g, "_")}`);

      assert.equal(result.compressedItems, 1);
      assert.equal(result.savedTokens > 0, true);
      assert.equal(result.forwardedBytes < result.originalBytes, true);
      assert.equal(result.retrievalIds.length, 1);
      assert.equal(store.saves, 1);
      assert.match(result.body, /\[molenkopf compressed:/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("reports observe-mode potential savings without mutating safe coding-agent output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compress-fixture-observe-"));
  const store = new CountingRetrievalStore(dir);
  try {
    const body = openAiBody(npmTestOutput());
    const result = await compressJsonBody(body, store, "req_observe_fixture", { compress: false, observe: true, fingerprintSecret: "test-secret" });

    assert.equal(result.body, body);
    assert.equal(result.compressedItems, 0);
    assert.equal(result.savedTokens, 0);
    assert.equal(result.potentialCompressedItems, 1);
    assert.equal(result.potentialSavedTokens > 0, true);
    assert.equal(result.skipReasons.observe_only, 1);
    assert.equal(store.saves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("keeps source-code-only coding context uncompressed without fake savings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compress-fixture-source-"));
  const store = new CountingRetrievalStore(dir);
  try {
    const source = Array.from({ length: 220 }, (_, i) => `export function case${i}() { return ${i}; }`).join("\n");
    const body = openAiBody(source);
    const result = await compressJsonBody(body, store, "req_source_fixture");

    assert.equal(result.body, body);
    assert.equal(result.compressedItems, 0);
    assert.equal(result.savedTokens, 0);
    assert.equal(result.potentialSavedTokens, 0);
    assert.equal(result.skipReasons.source_code_not_compressed, 1);
    assert.equal(result.contentKindCounts.source_code, 1);
    assert.equal(store.saves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("keeps diff-only coding context uncompressed without fake savings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compress-fixture-diff-"));
  const store = new CountingRetrievalStore(dir);
  try {
    const diff = `diff --git a/app.ts b/app.ts\n@@ -1,3 +1,${260} @@\n` + Array.from({ length: 260 }, (_, i) => `+export const value${i} = ${i};`).join("\n");
    const body = openAiBody(diff);
    const result = await compressJsonBody(body, store, "req_diff_fixture");

    assert.equal(result.body, body);
    assert.equal(result.compressedItems, 0);
    assert.equal(result.savedTokens, 0);
    assert.equal(result.potentialSavedTokens, 0);
    assert.equal(result.skipReasons.diff_not_compressed, 1);
    assert.equal(result.contentKindCounts.diff, 1);
    assert.equal(store.saves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function openAiBody(content: string): string {
  return JSON.stringify({ model: "test-model", messages: [{ role: "user", content }] });
}

function npmTestOutput(): string {
  return "$ npm test\n" + Array.from({ length: 280 }, (_, i) => `PASS packages/proxy/test/test-${i}.test.ts (${20 + i} ms)\nline ${i} repeated test output`).join("\n") + "\nFAIL packages/core/test/final.test.ts\nAssertionError: expected true";
}

function tscOutput(): string {
  return "$ npm run typecheck\n" + Array.from({ length: 260 }, (_, i) => `packages/core/src/file-${i}.ts:${i + 1}:7 - error TS2322: value ${i} is not assignable`).join("\n") + "\nFound 260 errors in 260 files.";
}

function stackTrace(): string {
  const vendor = Array.from({ length: 260 }, (_, i) => `    at vendor${i} (node_modules/pkg-${i}/index.js:${i + 1}:5)`).join("\n");
  return `Error: build failed\n    at run (packages/core/src/run.ts:12:3)\n${vendor}\nCaused by: AssertionError: expected output`;
}

function shellTranscript(): string {
  return "$ docker build .\n" + Array.from({ length: 260 }, (_, i) => `#${i} ${i % 10 === 0 ? "ERROR failed to solve step" : "CACHED build layer"} ${i}`).join("\n") + "\nexit code: 1";
}

function embeddedJson(): string {
  return JSON.stringify(Array.from({ length: 260 }, (_, i) => ({
    index: i,
    level: i % 7 === 0 ? "error" : "info",
    message: `worker event ${i}`
  })));
}

function markdownOutput(): string {
  const log = Array.from({ length: 300 }, (_, i) => `line ${i} repeated output`).join("\n") + "\nERROR final failure";
  return `# Build report\nKeep this explanation exact.\n\n\`\`\`log\n${log}\n\`\`\``;
}
