import test from "node:test";
import assert from "node:assert/strict";
import { compressJsonText } from "../src/compression/json-compressor.ts";

test("passes small JSON through", () => {
  const json = '{"a":1}';
  const result = compressJsonText(json, "molenkopf://sha256/small");
  assert.equal(result.text, json);
  assert.equal(result.compressed, false);
});

test("summarizes large object arrays with compact edges", () => {
  const arr = Array.from({ length: 60 }, (_, i) => ({ id: i, name: `item-${i}` }));
  const result = compressJsonText(JSON.stringify(arr), "molenkopf://sha256/big");
  assert.ok(result.compressed);
  assert.match(result.text, /\[molenkopf compressed: kind=json/);
  assert.match(result.text, /kept_edge_items=16/);
  assert.match(result.text, /omitted_items=44/);
  assert.match(result.text, /item-0/);
  assert.match(result.text, /item-59/);
  assert.doesNotMatch(result.text, /item-20/);
});

test("keeps important array rows outside the edge samples", () => {
  const arr = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    status: i === 41 ? "failed" : "ok",
    message: i === 41 ? "AssertionError: expected 401 received 200" : `normal row ${i}`
  }));
  const result = compressJsonText(JSON.stringify(arr), "molenkopf://sha256/errors");
  assert.ok(result.compressed);
  assert.match(result.text, /item_keys: id, status, message/);
  assert.match(result.text, /key_counts: id=80, status=80, message=80/);
  assert.match(result.text, /status_counts: status\.ok=79, status\.failed=1/);
  assert.match(result.text, /important_items:/);
  assert.match(result.text, /AssertionError: expected 401 received 200/);
  assert.doesNotMatch(result.text, /normal row 40/);
});

test("bounds high-cardinality array key summaries", () => {
  const arr = Array.from({ length: 120 }, (_, i) => ({ [`k${i * 2}`]: "x".repeat(300), [`k${i * 2 + 1}`]: "y".repeat(300) }));
  const result = compressJsonText(JSON.stringify(arr), "molenkopf://sha256/keys");
  const keyLine = result.text.split("\n").find((line) => line.startsWith("item_keys:")) ?? "";
  assert.match(keyLine, /omitted_key_entries=140/);
  assert.equal((keyLine.match(/\bk\d+\b/g) ?? []).length, 100);
  assert.doesNotMatch(keyLine, /\bk100\b/);
});

test("uses depth markers for deeply nested objects", () => {
  const nested = { root: { a: { b: { c: { d: { e: { value: "leaf" } } } } } } };
  const result = compressJsonText(JSON.stringify({ nested, filler: "x".repeat(2100) }), "molenkopf://sha256/deep");
  assert.ok(result.compressed);
  assert.match(result.text, /\[object \d+ keys truncated at depth 4\]/);
  assert.doesNotMatch(result.text, /"value": "leaf"/);
});

test("does not truncate source code stored under generic JSON string keys", () => {
  const source = Array.from({ length: 220 }, (_, i) => `export function f${i}() { return ${i}; }`).join("\n");
  const json = JSON.stringify({ input: source, note: "tool response" });
  const result = compressJsonText(json, "molenkopf://sha256/source");
  assert.equal(result.compressed, false);
  assert.equal(result.text, json);
});

test("does not truncate long prose or markdown stored in JSON strings", () => {
  const prose = Array.from({ length: 80 }, (_, i) => `This is a product note paragraph ${i} with non-operational context for a human reviewer.`).join("\n");
  const markdown = Array.from({ length: 80 }, (_, i) => `- checklist item ${i} that should remain readable`).join("\n");
  for (const json of [JSON.stringify({ notes: prose }), JSON.stringify({ document: markdown })]) {
    const result = compressJsonText(json, "molenkopf://sha256/prose");
    assert.equal(result.compressed, false);
    assert.equal(result.text, json);
  }
});

test("does not summarize arrays when later items contain source files", () => {
  const source = Array.from({ length: 220 }, (_, i) => `const value${i}: number = ${i};`).join("\n");
  const arr = Array.from({ length: 140 }, (_, i) => ({ path: `logs/row-${i}.txt`, content: `ok ${i}` }));
  arr[121] = { path: "src/protected.ts", content: source };
  const json = JSON.stringify(arr);
  const result = compressJsonText(json, "molenkopf://sha256/late-source");
  assert.equal(result.compressed, false);
  assert.equal(result.text, json);
});
