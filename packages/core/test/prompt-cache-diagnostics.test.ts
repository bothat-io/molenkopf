import test from "node:test";
import assert from "node:assert/strict";
import { fingerprintCacheInputs } from "../src/cache/prompt-cache-fingerprint.ts";
import { requestCacheDiagnostics } from "../src/cache/request-cache-diagnostics.ts";
import { measureToolSchemas } from "../src/tools/tool-schema-metrics.ts";

test("prompt cache fingerprint uses HMAC hashes and detects volatile prefix noise", () => {
  const result = fingerprintCacheInputs(
    [{ role: "user", content: "2026-01-01T00:00:00Z req_abcdef1234567890 run" }],
    [{ name: "search", parameters: { type: "object", properties: { q: { type: "string" } } } }],
    "local-secret"
  );
  assert.equal(result.staticPrefixHash.length, 64);
  assert.equal(result.toolSchemaHash.length, 64);
  assert.equal(result.hasTimestampNoise, true);
  assert.equal(result.hasRandomIdNoise, true);
  assert.equal(result.cacheablePrefixBytes > 0, true);
});

test("tool schema metrics measure bytes tokens and stable salted hash", () => {
  const metrics = measureToolSchemas([{ name: "b" }, { name: "a" }], "local-secret");
  assert.equal(metrics.toolCount, 2);
  assert.equal(metrics.schemaBytes > 0, true);
  assert.equal(metrics.schemaHash.length, 64);
  assert.equal(metrics.estimatedTokens > 0, true);
});

test("request cache diagnostics returns only safe hashes and numeric tool metrics", () => {
  const diagnostics = requestCacheDiagnostics(JSON.stringify({
    input: "Reply using 2026-01-01T00:00:00Z but never echo raw text.",
    tools: [{ name: "search", description: "raw tool description" }]
  }), "local-secret");
  assert.equal(diagnostics.staticPrefixHash?.length, 64);
  assert.equal(diagnostics.toolSchemaHash?.length, 64);
  assert.equal(diagnostics.toolCount, 1);
  assert.equal(diagnostics.hasTimestampNoise, true);
  assert.doesNotMatch(JSON.stringify(diagnostics), /raw text|raw tool description/);
});

test("request cache diagnostics skips empty JSON bodies", () => {
  assert.deepEqual(requestCacheDiagnostics("{}", "local-secret"), {});
});
