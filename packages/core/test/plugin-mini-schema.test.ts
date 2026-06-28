import test from "node:test";
import assert from "node:assert/strict";
import { validatePluginSettings } from "../src/plugins/plugin-settings-schema.ts";

test("plugin mini schema rejects unknown keys by default", () => {
  const schema = {
    type: "object",
    properties: {
      enabled: { type: "boolean" }
    }
  } as const;
  const value = { enabled: true, hidden: 1 };
  const result = validatePluginSettings(schema, value);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "unknown-property"));
});

test("plugin mini schema rejects schema beyond max depth", () => {
  const schema = {
    type: "object",
    properties: {
      level1: {
        type: "object",
        properties: {
          level2: {
            type: "object",
            properties: {
              level3: {
                type: "object",
                properties: {
                  level4: { type: "object", properties: { tooDeep: { type: "boolean" } } }
                }
              }
            }
          }
        }
      }
    }
  } as const;
  const result = validatePluginSettings(schema, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "schema-depth-exceeded"));
});

test("plugin mini schema enforces enum whitelist", () => {
  const schema = { type: "enum", values: ["off", "on"] } as const;
  const result = validatePluginSettings(schema, "bad");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "invalid-enum-value"));
});

test("plugin mini schema enforces array length cap", () => {
  const schema = { type: "array", items: { type: "boolean" }, maxLength: 2 } as const;
  const result = validatePluginSettings(schema, [true, false, true]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "array-too-long"));
});

