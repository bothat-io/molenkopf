import test from "node:test";
import assert from "node:assert/strict";
import { debugEnabled, debugLog, formatDebugLine } from "../src/debug/debug-log.ts";

test("debug scopes are disabled by default and enabled explicitly", () => {
  assert.equal(debugEnabled("sse", {}), false);
  assert.equal(debugEnabled("sse", { MOLENKOPF_DEBUG: "cli,usage" }), false);
  assert.equal(debugEnabled("sse", { MOLENKOPF_DEBUG: "cli,sse" }), true);
  assert.equal(debugEnabled("plugins", { MOLENKOPF_DEBUG: "all" }), true);
});

test("debug lines redact sensitive fields and bound strings", () => {
  const line = formatDebugLine("pipeline", "Request Started", {
    path: "/v1/responses?api_key=sk-test-secret",
    authorization: "Bearer sk-test-secret",
    long: "x".repeat(300)
  });
  assert.match(line, /^\[molenkopf:pipeline\] request_started /);
  assert.doesNotMatch(line, /sk-test-secret/);
  assert.match(line, /authorization="\[redacted\]"/);
  assert.ok(line.length < 360);
});

test("debugLog writes only when the requested scope is enabled", () => {
  const lines: string[] = [];
  const write = (line: string) => { lines.push(line); return true; };
  debugLog("cli", "step", { step: "running command - npm" }, { MOLENKOPF_DEBUG: "sse" }, write);
  debugLog("cli", "step", { step: "running command - npm" }, { MOLENKOPF_DEBUG: "cli" }, write);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[molenkopf:cli\] step step="running command - npm"/);
});
