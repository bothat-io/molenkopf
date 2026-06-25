import test from "node:test";
import assert from "node:assert/strict";
import { parseMolenkopfConfigJson } from "../src/config/molenkopf-config.ts";

const provider = { id: "openai-main", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } };

function parse(extra: Record<string, unknown>) {
  return parseMolenkopfConfigJson(JSON.stringify({ schemaVersion: 1, providers: [provider], ...extra }));
}

test("rejects dangling profile and plugin policy references without collection guards", () => {
  assert.throws(() => parse({ agents: [{ id: "ci", profileId: "missing" }] }), /unknown profile in agent: missing/);
  assert.throws(() => parse({ agents: [{ id: "ci", providerId: "openai-main", pluginPolicyId: "missing" }] }), /unknown plugin policy in agent: missing/);
});

test("rejects providerless, conflicting, disabled, and malformed agent references", () => {
  assert.throws(() => parse({ agents: [{ id: "ci" }] }), /agent requires provider or profile: ci/);
  assert.throws(() => parse({
    profiles: [{ id: "default-local", providerId: "openai-main" }],
    agents: [{ id: "ci", providerId: "openai-main", profileId: "default-local" }]
  }), /conflicting provider\/profile in agent: ci/);
  assert.throws(() => parse({
    providers: [{ ...provider, enabled: false }],
    profiles: [{ id: "default-local", providerId: "openai-main" }],
    agents: [{ id: "ci", profileId: "default-local" }]
  }), /agent provider disabled: openai-main/);
  assert.throws(() => parse({ agents: [{ id: "ci", providerId: "openai-main", profileId: "bad id" }] }), /invalid id: \$\.agents\[0\]\.profileId/);
});

test("rejects empty, duplicate, or malformed agent scopes", () => {
  assert.throws(() => parse({ agents: [{ id: "ci", providerId: "openai-main", scopes: [] }] }), /empty string array: \$\.agents\[0\]\.scopes/);
  assert.throws(() => parse({ agents: [{ id: "ci", providerId: "openai-main", scopes: ["proxy:use", "proxy:use"] }] }), /duplicate \$\.agents\[0\]\.scopes id/);
  assert.throws(() => parse({ agents: [{ id: "ci", providerId: "openai-main", scopes: ["bad id"] }] }), /invalid id: \$\.agents\[0\]\.scopes\[0\]/);
});
