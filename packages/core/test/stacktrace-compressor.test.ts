import test from "node:test";
import assert from "node:assert/strict";
import { compressStacktrace } from "../src/compression/stacktrace-compressor.ts";

test("keeps message and app frames while collapsing vendor frames", () => {
  const trace = [
    "TypeError: Cannot read properties of undefined",
    "    at run (/work/src/app.ts:10:3)",
    ...Array.from({ length: 30 }, (_, i) => `    at vendor${i} (/work/node_modules/pkg/index.js:${i}:1)`),
    ...Array.from({ length: 20 }, (_, i) => `    at internal${i} (node:internal/modules/cjs/loader:${i}:1)`),
    "    at run (/work/src/other.ts:20:3)"
  ].join("\n");
  const result = compressStacktrace(trace, "molenkopf://sha256/trace");
  assert.ok(result.compressed);
  assert.match(result.text, /TypeError/);
  assert.match(result.text, /src\/app.ts:10/);
  assert.match(result.text, /src\/other.ts:20/);
  assert.match(result.text, /vendor\/stdlib frames/);
});

test("preserves Java caused-by chains while folding repository frames", () => {
  const trace = [
    "java.lang.IllegalStateException: request failed",
    "\tat com.acme.proxy.RequestPipeline.run(RequestPipeline.java:88)",
    ...Array.from({ length: 35 }, (_, i) => `\tat org.junit.runner.Runner.run(/home/.m2/repository/junit/junit.jar:${i})`),
    "Caused by: com.acme.PluginPolicyException: missing body:write",
    "\tat com.acme.plugins.PluginRunner.run(PluginRunner.java:41)",
    ...Array.from({ length: 25 }, (_, i) => `\tat org.gradle.internal.Execute.run(/home/.gradle/caches/modules-${i}.jar:1)`)
  ].join("\n");
  const result = compressStacktrace(trace, "molenkopf://sha256/java");
  assert.ok(result.compressed);
  assert.match(result.text, /Caused by: com\.acme\.PluginPolicyException/);
  assert.match(result.text, /RequestPipeline\.java:88/);
  assert.match(result.text, /PluginRunner\.java:41/);
  assert.doesNotMatch(result.text, /\.m2\/repository\/junit/);
});

test("folds repeated recursive frames", () => {
  const trace = [
    "RangeError: Maximum call stack size exceeded",
    ...Array.from({ length: 40 }, () => "    at visit (/work/packages/core/src/walk.ts:12:5)"),
    "    at parse (/work/packages/core/src/parser.ts:44:9)"
  ].join("\n");
  const result = compressStacktrace(trace, "molenkopf://sha256/recurse");
  assert.ok(result.compressed);
  assert.match(result.text, /omitted: 39 repeated frames/);
  assert.match(result.text, /parser\.ts:44/);
});
