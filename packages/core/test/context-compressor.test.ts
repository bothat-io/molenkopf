import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compressContext } from "../src/compression/context-compressor.ts";
import { RetrievalStore } from "../src/store/retrieval-store.ts";

class CountingRetrievalStore extends RetrievalStore {
  saves = 0;

  override async save(text: string, meta: Parameters<RetrievalStore["save"]>[1]): ReturnType<RetrievalStore["save"]> {
    this.saves += 1;
    return super.save(text, meta);
  }
}

class FailingRetrievalStore extends RetrievalStore {
  override async save(): ReturnType<RetrievalStore["save"]> {
    throw new Error("store unavailable");
  }
}

test("direct compression stores only redacted bounded excerpts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-"));
  const store = new RetrievalStore(dir);
  try {
    const log = Array.from({ length: 260 }, (_, i) => `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z INFO line ${i} token=direct-plain-secret`).join("\n");
    const result = await compressContext(log, store, "direct");
    assert.equal(result.compressed, true);
    assert.equal(result.redactedSecrets > 0, true);
    assert.ok(result.retrievalId);
    const retrieved = await store.retrieve(result.retrievalId);
    assert.match(retrieved, /Context excerpt only/);
    assert.doesNotMatch(retrieved, /direct-plain-secret/);
    assert.match(retrieved, /REDACTED_SECRET:token/);
    assert.doesNotMatch(retrieved, /line 259/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("compresses operational fenced blocks inside markdown without touching prose", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-md-"));
  const store = new RetrievalStore(dir);
  try {
    const log = Array.from({ length: 320 }, (_, i) => `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z INFO line ${i} build output token=embedded-secret`).join("\n") + "\nERROR final failure";
    const markdown = `# Build report\nKeep this explanation exact.\n\n\`\`\`log\n${log}\n\`\`\``;
    const result = await compressContext(markdown, store, "embedded");
    assert.equal(result.compressed, true);
    assert.equal(result.kind, "markdown");
    assert.match(result.text, /Keep this explanation exact/);
    assert.match(result.text, /\[molenkopf compressed: kind=log/);
    assert.ok(result.retrievalId);
    const retrieved = await store.retrieve(result.retrievalId);
    assert.match(retrieved, /Context excerpt only/);
    assert.doesNotMatch(retrieved, /embedded-secret/);
    assert.doesNotMatch(retrieved, /ERROR final failure/);
    const disallowed = await compressContext(markdown, store, "embedded-disallowed", { allowedKinds: ["json"] });
    assert.equal(disallowed.compressed, false);
    assert.doesNotMatch(disallowed.text, /\[molenkopf compressed: kind=log/);
    assert.doesNotMatch(disallowed.text, /embedded-secret/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not compress fenced source code blocks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-src-"));
  const store = new RetrievalStore(dir);
  try {
    const source = Array.from({ length: 260 }, (_, i) => `export function f${i}() { return ${i}; }`).join("\n");
    const result = await compressContext(`# Source\n\`\`\`ts\n${source}\n\`\`\``, store, "source");
    assert.equal(result.compressed, false);
    assert.match(result.text, /export function f259/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not compress common shell and web source fences", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-fences-"));
  const store = new RetrievalStore(dir);
  try {
    const shell = Array.from({ length: 260 }, (_, i) => `echo "line ${i}"`).join("\n");
    const css = Array.from({ length: 260 }, (_, i) => `.item-${i} { color: red; }`).join("\n");
    const result = await compressContext(`\`\`\`bash\n${shell}\n\`\`\`\n\`\`\`css\n${css}\n\`\`\``, store, "fences");
    assert.equal(result.compressed, false);
    assert.match(result.text, /echo "line 259"/);
    assert.match(result.text, /\.item-259/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not compress ordinary prose that mentions PASS once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-prose-"));
  const store = new RetrievalStore(dir);
  try {
    const prose = Array.from({ length: 260 }, (_, i) =>
      i === 130
        ? "This product note says PASS as a label, not as terminal output."
        : `This is ordinary explanatory prose line ${i} with no operational output.`
    ).join("\n");
    const result = await compressContext(prose, store, "prose");
    assert.equal(result.compressed, false);
    assert.equal(result.text, prose);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not compress JSON bundles that contain source files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-json-source-"));
  const store = new RetrievalStore(dir);
  try {
    const files = Array.from({ length: 60 }, (_, i) => ({
      path: `packages/core/src/example-${i}.ts`,
      content: `export function example${i}() { return ${i}; }`
    }));
    const sourceBundle = JSON.stringify(files);
    const result = await compressContext(sourceBundle, store, "json-source");
    assert.equal(result.compressed, false);
    assert.equal(result.text, sourceBundle);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not scan or compress embedded operational fences inside diffs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-diff-"));
  const store = new CountingRetrievalStore(dir);
  try {
    const log = Array.from({ length: 260 }, (_, i) => `2026-01-01T00:00:00Z INFO line ${i}`).join("\n") + "\nERROR final failure";
    const diff = `diff --git a/report.md b/report.md\n@@ -1,3 +1,8 @@\n+\`\`\`log\n+${log.replace(/\n/g, "\n+")}\n+\`\`\``;
    const result = await compressContext(diff, store, "diff");

    assert.equal(result.compressed, false);
    assert.equal(result.text, diff);
    assert.equal(store.saves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("does not write retrieval records when compression is skipped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-noop-"));
  const store = new CountingRetrievalStore(dir);
  try {
    const text = "Short user context that is below the compression threshold.";
    const result = await compressContext(text, store, "noop");

    assert.equal(result.compressed, false);
    assert.equal(result.text, text);
    assert.equal(store.saves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips compression when retrieval storage is unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-store-"));
  const store = new FailingRetrievalStore(dir);
  try {
    const log = Array.from({ length: 260 }, (_, i) => `2026-01-01T00:00:00Z INFO line ${i}`).join("\n") + "\nERROR final failure";
    const result = await compressContext(log, store, "store");

    assert.equal(result.compressed, false);
    assert.equal(result.reason, "retrieval_store_unavailable");
    assert.equal(result.metrics.savedTokens, 0);
    assert.equal(result.text, log);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips compression below the configured savings gate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-compressor-gate-"));
  const store = new CountingRetrievalStore(dir);
  try {
    const log = Array.from({ length: 320 }, (_, i) => `2026-01-01T00:00:00Z INFO line ${i}`).join("\n") + "\nERROR final failure";
    const result = await compressContext(log, store, "gate", { minSavedTokens: 100000 });

    assert.equal(result.compressed, false);
    assert.equal(result.reason, "below_min_saved_tokens");
    assert.equal(store.saves, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
