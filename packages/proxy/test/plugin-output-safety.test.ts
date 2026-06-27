import test from "node:test";
import assert from "node:assert/strict";
import { buildPluginData } from "../src/http/plugin-data.ts";
import { safePluginOutput } from "../src/http/plugin-output-safety.ts";
import { createRuntimeState } from "../src/http/runtime-state.ts";

test("safePluginOutput redacts sensitive keys and token-like values", () => {
  const safe = safePluginOutput("fixture", {
    authorization: "Bearer sk-raw-secret",
    nested: { token: "mk_12345678901234567890123456789012", note: "safe text" },
    prompt: "full prompt must not leave plugin output",
    rows: [{ cookie: "sid=secret" }]
  });
  const text = JSON.stringify(safe);
  assert.doesNotMatch(text, /sk-raw-secret|mk_123456|full prompt|sid=secret/);
  assert.match(text, /REDACTED_PLUGIN_OUTPUT/);
  assert.match(text, /safe text/);
});

test("safePluginOutput defaults to strict and accepts explicit scope mode", () => {
  const safeStrict = safePluginOutput("fixture", {
    plugin: "context-compressor-plugin",
    prompt: "full prompt",
    response: "normal response"
  });
  const safeAdmin = safePluginOutput("fixture", {
    plugin: "context-compressor-plugin",
    prompt: "full prompt",
    response: "normal response"
  }, "adminSafe");
  assert.equal(typeof safeStrict, "object");
  assert.deepEqual(safeStrict, safeAdmin);
  assert.equal((safeStrict as any).prompt, "[REDACTED_PLUGIN_OUTPUT]");
  assert.equal((safeStrict as any).response, "normal response");
});

test("buildPluginData sanitizes successful plugin data payloads", async () => {
  const state = createRuntimeState({ target: "http://127.0.0.1:1/v1" }, "127.0.0.1");
  const result = await buildPluginData("obsidian-graph-plugin", fakeAudit(), state, undefined, {
    data: async () => ({ ok: true, payload: { responseBody: "raw response", public: "ok" } })
  } as any);
  assert.equal(result.status, 200);
  assert.equal((result.payload as any).public, "ok");
  assert.doesNotMatch(JSON.stringify(result.payload), /raw response/);
});

test("safePluginOutput detects circular references", () => {
  const a: Record<string, unknown> = { label: "root" };
  a.self = a;
  const sanitized = safePluginOutput("fixture", a);
  assert.equal(JSON.stringify(sanitized.self), "\"[CIRCULAR_REFERENCE]\"");
});

function fakeAudit() {
  return { listPage: async () => ({ items: [] }) } as any;
}
