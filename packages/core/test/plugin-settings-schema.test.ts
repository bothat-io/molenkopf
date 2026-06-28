import test from "node:test";
import assert from "node:assert/strict";
import { defaultPluginSettings, normalizePluginSettings, redactPluginSettingsForView, validatePluginSettings } from "../src/plugins/plugin-settings-schema.ts";

test("plugin settings apply defaults and clamp values", () => {
  const schema = {
    type: "object",
    properties: {
      compressionStrength: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      mode: { type: "enum", values: ["off", "light", "aggressive"], default: "light" },
      secretToken: { type: "string", default: "" }
    }
  } as const;
  const normalized = normalizePluginSettings(schema, { compressionStrength: 999, mode: "aggressive", secretToken: "mk_12345678901234567890" }) as {
    compressionStrength: number;
    mode: string;
    secretToken: string;
  };
  assert.equal(normalized.compressionStrength, 100);
  assert.equal(normalized.mode, "aggressive");
  assert.equal(normalized.secretToken, "mk_12345678901234567890");
});

test("plugin settings validate too long strings and reject malformed numbers", () => {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string", maxLength: 8 },
      limit: { type: "number", minimum: 0, maximum: 10 },
      enabled: { type: "boolean" }
    }
  } as const;
  const result = validatePluginSettings(schema, { title: "this string is too long", limit: "5", enabled: true });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "string-too-long" || entry.code === "expected-finite-number"));
});

test("plugin settings default function adds missing values", () => {
  const schema = {
    type: "object",
    properties: { enabled: { type: "boolean", default: true }, limit: { type: "number", default: 10 } }
  } as const;
  assert.deepEqual(defaultPluginSettings(schema), { enabled: true, limit: 10 });
});

test("plugin settings redact sensitive values for member view", () => {
  const schema = {
    type: "object",
    properties: {
      token: { type: "string", sensitive: true, default: "" },
      label: { type: "string", default: "" }
    }
  } as const;
  const redacted = redactPluginSettingsForView(schema, { token: "mk_12345678901234567890", label: "safe" }, "member");
  assert.deepEqual(redacted, { token: "[REDACTED]", label: "safe" });
});

