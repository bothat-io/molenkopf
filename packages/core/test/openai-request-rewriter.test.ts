import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RetrievalStore } from "../src/store/retrieval-store.ts";
import { compressJsonBody, rewriteOpenAiJsonBody } from "../src/pipeline/openai-request-rewriter.ts";

test("compresses long strings, preserves source, redacts sensitive values, and audits safely", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-"));
  const store = new RetrievalStore(dir);
  const longLog = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR boom";
  const source = "export function run() {\n  return 1;\n}";
  const fakeOpenAiKey = ["s", "k"].join("") + "-proj-" + "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJK";
  const body = { input: longLog, code: source, secret: "token=render-secret-0", api_key: fakeOpenAiKey };
  const result = await rewriteOpenAiJsonBody(JSON.stringify(body), store, "req_test");
  const rewritten = JSON.parse(result.body);
  assert.match(rewritten.input, /\[molenkopf compressed: kind=log/);
  assert.equal(rewritten.code, source);
  assert.match(rewritten.secret, /^\[REDACTED_SECRET:json_secret/);
  assert.match(rewritten.api_key, /^\[REDACTED_SECRET:json_api_key/);
  assert.equal(result.audit.compressedItems, 1);
  assert.equal(result.audit.estimatedSavedTokens > 0, true);
  assert.doesNotMatch(JSON.stringify(result.audit), /sk-proj|line 199/);
  const retrieved = await store.retrieve(result.audit.retrievalIds[0]);
  assert.match(retrieved, /Context excerpt only/);
  assert.doesNotMatch(retrieved, /render-secret-0|sk-proj-/);
  assert.doesNotMatch(retrieved, /line 259/);
  await rm(dir, { recursive: true, force: true });
});

test("does not count JSON serialization changes as compression savings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-short-"));
  const store = new RetrievalStore(dir);
  const body = '{\n  "input": "short text",\n  "n": 9007199254740993,\n  "n": -0,\n  "escaped": "\\u003c"\n}';
  const result = await compressJsonBody(body, store, "req_short");
  assert.equal(result.body, body);
  assert.equal(result.compressedItems, 0);
  assert.equal(result.savedTokens, 0);
  await rm(dir, { recursive: true, force: true });
});

test("compress=false preserves exact JSON bytes even for deep or lossy parse cases", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-exact-"));
  const store = new RetrievalStore(dir);
  const deep = `${'{"n":'.repeat(205)}"leaf"${"}".repeat(205)}`;
  const body = `{"unsafe":9007199254740993,"negativeZero":-0,"dup":"a","dup":"b","deep":${deep}}`;
  const result = await compressJsonBody(body, store, "req_exact", false);
  assert.equal(result.body, body);
  assert.equal(result.compressedItems, 0);
  assert.equal(result.savedTokens, 0);
  await rm(dir, { recursive: true, force: true });
});

test("redacts embedded JSON strings before retrieval storage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-json-string-"));
  const store = new RetrievalStore(dir);
  const embedded = JSON.stringify(Array.from({ length: 260 }, (_, i) => ({ line: i, password: "plain-json-password", clientSecret: "plain-client-secret" })));
  const result = await rewriteOpenAiJsonBody(JSON.stringify({ input: embedded }), store, "req_embedded");
  assert.equal(result.audit.compressedItems, 1);
  assert.equal(result.audit.redactedSecrets > 0, true);
  const rewritten = JSON.parse(result.body);
  assert.doesNotMatch(rewritten.input, /plain-json-password|plain-client-secret/);
  const retrieved = await store.retrieve(result.audit.retrievalIds[0]);
  assert.match(retrieved, /Context excerpt only/);
  assert.doesNotMatch(retrieved, /plain-json-password|plain-client-secret/);
  assert.match(retrieved, /REDACTED_SECRET:json_password/);
  assert.doesNotMatch(retrieved, /"line":259/);
  await rm(dir, { recursive: true, force: true });
});

test("compresses markdown-wrapped operational logs in JSON request strings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-md-log-"));
  const store = new RetrievalStore(dir);
  const log = Array.from({ length: 320 }, (_, i) => `line ${i} repeated output`).join("\n") + "\nERROR final failure";
  const markdown = `# Investigation\nInvestigation notes stay intact.\n\n\`\`\`\n${log}\n\`\`\``;
  const result = await rewriteOpenAiJsonBody(JSON.stringify({ input: markdown }), store, "req_md_log");
  const rewritten = JSON.parse(result.body);
  assert.match(rewritten.input, /Investigation notes stay intact/);
  assert.match(rewritten.input, /\[molenkopf compressed: kind=log/);
  assert.equal(result.audit.compressedItems, 1);
  assert.equal(result.audit.estimatedSavedTokens > 0, true);
  assert.match(result.audit.compressorsUsed[0], /embedded-log/);
  await rm(dir, { recursive: true, force: true });
});

test("deeply nested JSON does not overflow the stack", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rewrite-deep-"));
  const store = new RetrievalStore(dir);
  const deep = `${'{"n":'.repeat(5000)}"leaf"${"}".repeat(5000)}`;
  const body = `{"root":${deep}}`;
  const result = await rewriteOpenAiJsonBody(body, store, "req_deep");
  assert.equal(result.body, body);
  assert.doesNotMatch(result.body, /max json depth/);
  await rm(dir, { recursive: true, force: true });
});
