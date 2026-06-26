import test from "node:test";
import assert from "node:assert/strict";
import { parseMolenkopfConfigJson } from "../src/config/molenkopf-config.ts";

test("rejects inline credentials and ambiguous secret fields", () => {
  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "inline", baseUrl: "https://api.openai.com/v1", auth: { credential: "fixture-inline-secret" } }]
  })), /forbidden secret field/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad", baseUrl: "https://api.openai.com/v1", auth: { apiKey: "fixture-inline-secret" } }]
  })), /forbidden secret field/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "fixture-inline-secret" } }]
  })), /invalid credentialRef/);

  for (const key of ["credential", "credentials", "accessCredential", "clientCredentials"]) {
    assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
      schemaVersion: 1,
      providers: [{ id: `bad-${key.toLowerCase()}`, baseUrl: "https://api.openai.com/v1", [key]: "fixture-inline-secret" }]
    })), /forbidden secret field/);
  }

  for (const key of ["openaiApiKey", "bearerToken", "clientSecret"]) {
    assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
      schemaVersion: 1,
      providers: [{ id: `bad-${key.toLowerCase()}`, baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" }, [key]: "fixture-inline-secret" }]
    })), /forbidden secret field/);
  }

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad-secret-ref", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "secret:openai-main" } }]
  })), /unsupported credentialRef/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "top-ref", baseUrl: "https://api.openai.com/v1", credentialRef: "env:OPENAI_API_KEY" }]
  })), /top-level credentialRef/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "top-auth", baseUrl: "https://api.openai.com/v1", authScheme: "bearer" }]
  })), /top-level authScheme/);
});

test("rejects invalid explicit provider auth and protocol enums", () => {
  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad-auth", baseUrl: "https://api.openai.com/v1", auth: { scheme: "bogus", credentialRef: "none" } }]
  })), /invalid provider auth\.scheme/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad-protocol", baseUrl: "https://api.openai.com/v1", protocol: "bogus", auth: { credentialRef: "none" } }]
  })), /invalid provider protocol/);

  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "defaulted", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } }]
  }));
  assert.equal(config.providers[0].authScheme, "none");
  assert.equal(config.providers[0].protocol, "openai-responses");
});

test("allows safe token accounting field names in JSON config", () => {
  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    budget: { tokenLimit: 1000, tokensPerDay: 1000 },
    usage: { inputTokens: 10, outputTokens: 3 },
    providers: [{ id: "defaulted", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } }]
  }));
  assert.equal(config.providers[0].id, "defaulted");
});
