import test from "node:test";
import assert from "node:assert/strict";
import { compressStacktrace } from "../src/compression/stacktrace-compressor.ts";

test("keeps message and app frames while collapsing vendor frames", () => {
  const trace = [
    "TypeError: Cannot read properties of undefined",
    "    at run (/work/src/app.ts:10:3)",
    "    at Object.<anonymous> (/work/node_modules/pkg/index.js:1:1)",
    "    at Module._compile (node:internal/modules/cjs/loader:1:1)",
    "    at run (/work/src/other.ts:20:3)"
  ].join("\n");
  const result = compressStacktrace(trace, "molenkopf://sha256/trace");
  assert.ok(result.compressed);
  assert.match(result.text, /TypeError/);
  assert.match(result.text, /src\/app.ts:10/);
  assert.match(result.text, /src\/other.ts:20/);
  assert.match(result.text, /vendor\/stdlib frames/);
});
