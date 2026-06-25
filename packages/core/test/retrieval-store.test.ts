import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RetrievalStore } from "../src/store/retrieval-store.ts";

test("stores only bounded excerpts by retrieval id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-retrieval-"));
  const store = new RetrievalStore(dir);
  const saved = await store.save("original text", {
    contentKind: "log",
    compressedBytes: 5,
    compressorName: "test",
    redacted: true
  });
  assert.match(saved.id, /^molenkopf:\/\/sha256\//);
  const retrieved = await store.retrieve(saved.id);
  assert.match(retrieved, /Context excerpt only/);
  assert.match(retrieved, /original text/);
  const meta = await store.metadata(saved.id);
  assert.equal(meta.contentKind, "log");
  assert.equal(meta.originalBytes, 13);
  await store.purgeAll();
  await assert.rejects(store.retrieve(saved.id));
  await rm(dir, { recursive: true, force: true });
});

test("does not persist full long originals", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-retrieval-long-"));
  const store = new RetrievalStore(dir);
  const text = `start ${"x".repeat(1000)} secret-tail`;
  const saved = await store.save(text, {
    contentKind: "log",
    compressedBytes: 5,
    compressorName: "test",
    redacted: true
  });
  const retrieved = await store.retrieve(saved.id);
  assert.match(retrieved, /TRUNCATED_CONTEXT/);
  assert.doesNotMatch(retrieved, /secret-tail/);
  await rm(dir, { recursive: true, force: true });
});

test("rejects malformed retrieval ids before building paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-retrieval-id-"));
  const store = new RetrievalStore(dir);
  await assert.rejects(store.retrieve("molenkopf://sha256/../../identity.db"), /invalid retrieval id/);
  await assert.rejects(store.metadata("molenkopf://sha256/not-a-hex-hash"), /invalid retrieval id/);
  await rm(dir, { recursive: true, force: true });
});
