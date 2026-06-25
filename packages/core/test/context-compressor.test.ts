import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compressContext } from "../src/compression/context-compressor.ts";
import { RetrievalStore } from "../src/store/retrieval-store.ts";

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
