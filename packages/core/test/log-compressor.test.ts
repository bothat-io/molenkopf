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

test("folds repetitive CI output while preserving a middle failure", () => {
  const lines = [
    "npm test",
    ...Array.from({ length: 180 }, (_, i) => `2026-01-01T00:00:00Z progress ${i} resolved package ${i}`),
    "FAIL packages/core/test/example.test.ts",
    "AssertionError: expected 401 received 200",
    "at packages/core/src/auth.ts:41:10",
    ...Array.from({ length: 180 }, (_, i) => `2026-01-01T00:00:00Z progress ${i} resolved package ${i}`)
  ];
  const result = compressLog(lines.join("\n"), "molenkopf://sha256/abc");

  assert.ok(result.compressed);
  assert.match(result.text, /FAIL packages\/core\/test\/example.test.ts/);
  assert.match(result.text, /AssertionError/);
  assert.match(result.text, /packages\/core\/src\/auth.ts:41:10/);
  assert.match(result.text, /repeated\/noisy lines/);
  assert.equal(result.text.length < lines.join("\n").length / 2, true);
});

test("extracts CI failure summary fields for agents", () => {
  const lines = [
    "$ pnpm test",
    ...Array.from({ length: 260 }, (_, i) => `2026-01-01T00:00:00Z vite transform ${i} progress ${i % 9}`),
    "FAIL packages/core/test/openai-request-rewriter.test.ts > compresses logs",
    "AssertionError: expected rewritten.input to match compressed marker",
    "    at packages/core/test/openai-request-rewriter.test.ts:81:10",
    "exit code 1"
  ];
  const result = compressLog(lines.join("\n"), "molenkopf://sha256/ci");
  assert.ok(result.compressed);
  assert.match(result.text, /command: pnpm test/);
  assert.match(result.text, /exit_code: 1/);
  assert.match(result.text, /failed_tests:/);
  assert.match(result.text, /assertions:/);
  assert.match(result.text, /app_frames:/);
});

test("extracts cwd stderr and final summaries from shell output", () => {
  const lines = [
    "cwd: /work/molenkopf",
    "$ docker build .",
    ...Array.from({ length: 240 }, (_, i) => `2026-01-01T00:00:00Z progress ${i} extracting layer ${i}`),
    "stderr: failed to solve: process exited with code 1",
    "ERROR Dockerfile:12 missing package",
    "Tests: 1 failed, 4 passed",
    "exit code 1"
  ];
  const result = compressLog(lines.join("\n"), "molenkopf://sha256/shell");
  assert.ok(result.compressed);
  assert.match(result.text, /cwd: \/work\/molenkopf/);
  assert.match(result.text, /stderr_summary:/);
  assert.match(result.text, /failed to solve/);
  assert.match(result.text, /final_summary:/);
  assert.match(result.text, /Tests: 1 failed, 4 passed/);
});

test("keeps compiler, npm, and docker failure signals", () => {
  const lines = [
    "$ npm run build",
    ...Array.from({ length: 260 }, (_, i) => `2026-01-01T00:00:00Z npm timing idealTree:${i} Completed in ${i}ms`),
    "src/index.ts:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.",
    "npm ERR! code ELIFECYCLE",
    "stderr: failed to solve: process exited with code 1",
    "exit code 1"
  ];
  const result = compressLog(lines.join("\n"), "molenkopf://sha256/build");
  assert.ok(result.compressed);
  assert.match(result.text, /command: npm run build/);
  assert.match(result.text, /error TS2322/);
  assert.match(result.text, /npm ERR! code ELIFECYCLE/);
  assert.match(result.text, /failed to solve/);
  assert.match(result.text, /exit_code: 1/);
});

test("scrubs sensitive command arguments from CI summaries", () => {
  const lines = [
    "$ npm test --token raw-secret --api-key=another-secret",
    ...Array.from({ length: 260 }, (_, i) => `2026-01-01T00:00:00Z progress ${i} resolved package ${i}`),
    "FAIL packages/core/test/security.test.ts",
    "exit code 1"
  ];
  const result = compressLog(lines.join("\n"), "molenkopf://sha256/command");
  assert.ok(result.compressed);
  assert.match(result.text, /command: npm test --token \[REDACTED_SECRET:cli_arg\] --api-key=\[REDACTED_SECRET:cli_arg\]/);
  assert.doesNotMatch(result.text, /raw-secret|another-secret/);
});

test("preserves late expected and received details when early assertions fill the budget", () => {
  const lines = [
    "$ npm test",
    ...Array.from({ length: 220 }, (_, i) => `AssertionError: early noisy assertion ${i}`),
    ...Array.from({ length: 160 }, (_, i) => `progress ${i} resolved package ${i}`),
    "FAIL packages/core/test/security.test.ts > rejects leaked credentials",
    "Expected: 401",
    "Received: 200",
    "    at packages/core/test/security.test.ts:81:10",
    "exit code 1"
  ];
  const result = compressLog(lines.join("\n"), "molenkopf://sha256/late");
  assert.ok(result.compressed);
  assert.match(result.text, /FAIL packages\/core\/test\/security.test.ts/);
  assert.match(result.text, /Expected: 401/);
  assert.match(result.text, /Received: 200/);
  assert.match(result.text, /packages\/core\/test\/security.test.ts:81:10/);
});
