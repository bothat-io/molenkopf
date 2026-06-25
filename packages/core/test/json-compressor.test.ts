import test from "node:test";
import assert from "node:assert/strict";
import { compressJsonText } from "../src/compression/json-compressor.ts";

test("passes small JSON through", () => {
  const json = '{"a":1}';
  const result = compressJsonText(json, "molenkopf://sha256/small");
  assert.equal(result.text, json);
  assert.equal(result.compressed, false);
});

test("summarizes large object arrays with first and last items", () => {
  const arr = Array.from({ length: 60 }, (_, i) => ({ id: i, name: `item-${i}` }));
  const result = compressJsonText(JSON.stringify(arr), "molenkopf://sha256/big");
  assert.ok(result.compressed);
  assert.match(result.text, /\[molenkopf compressed: kind=json/);
  assert.match(result.text, /item-0/);
  assert.match(result.text, /item-59/);
  assert.match(result.text, /omitted_items=20/);
});
