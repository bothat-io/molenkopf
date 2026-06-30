import test from "node:test";
import assert from "node:assert/strict";
import { validatePluginActionOutput } from "../src/plugins/plugin-action-output.ts";

const schema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string", maxLength: 20 } },
        required: ["label"],
        additionalProperties: false
      },
      maxLength: 2
    }
  },
  required: ["results"],
  additionalProperties: false
} as const;

test("plugin action output validator accepts schema-matching results", () => {
  const result = validatePluginActionOutput(schema, { results: [{ label: "ok" }] });
  assert.equal(result.ok, true);
});

test("plugin action output validator rejects malformed schema output", () => {
  const result = validatePluginActionOutput(schema, { results: [{ label: 1 }] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "expected-string"));
});

test("plugin action output validator rejects unsafe nested values", () => {
  const result = validatePluginActionOutput(
    { type: "object", properties: {}, additionalProperties: true },
    { results: [{ authorization: "Bearer abcdefghijklmnop" }] }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "unsafe-output-key"));
});
