import test from "node:test";
import assert from "node:assert/strict";
import { compressLog } from "../src/compression/log-compressor.ts";

test("compresses logs while preserving errors, edges, and retrieval marker", () => {
  const middle = Array.from({ length: 260 }, (_, i) => `\u001b[31mprogress ${i % 3}\u001b[0m`);
  const log = ["first line", ...middle, "ERROR failed at src/app.ts:9", "exit code 1", "last line"].join("\n");
  const result = compressLog(log, "molenkopf://sha256/abc");
  assert.ok(result.compressed);
  assert.match(result.text, /\[molenkopf compressed: kind=log/);
  assert.match(result.text, /\[molenkopf omitted:/);
  assert.match(result.text, /first line/);
  assert.match(result.text, /ERROR failed/);
  assert.match(result.text, /exit code 1/);
  assert.match(result.text, /last line/);
  assert.doesNotMatch(result.text, /\u001b\[/);
});
