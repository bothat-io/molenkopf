import test from "node:test";
import assert from "node:assert/strict";
import { parseMolenkopfConfigJson } from "../src/config/molenkopf-config.ts";

test("parses JSON provider config with env credential refs", () => {
  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    server: { bindHost: "127.0.0.1", port: 8787 },
    providers: [
      {
        id: "openai-main",
        name: "OpenAI Main",
        kind: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: { scheme: "bearer", credentialRef: "env:OPENAI_MAIN_API_KEY" },
        enabled: true
      },
      {
        id: "claude-main",
        name: "Claude Main",
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        auth: { scheme: "x-api-key", credentialRef: "env:ANTHROPIC_MAIN_API_KEY" },
        enabled: true
      }
    ],
    profiles: [{ id: "default-local", providerId: "openai-main", allowedModels: ["gpt-4.1-mini"] }],
    pluginPolicies: [{ id: "standard-policy", enabledPluginIds: ["context-compressor-plugin"] }],
    agents: [{ id: "operator-codex", profileId: "default-local", pluginPolicyId: "standard-policy" }]
  }));

  assert.equal(config.target, "https://api.openai.com/v1");
  assert.equal(config.server.port, 8787);
  assert.equal(config.activeProviderId, "openai-main");
  assert.equal(config.providers.length, 2);
  assert.equal(config.providers[0].credentialEnv, "OPENAI_MAIN_API_KEY");
  assert.equal(config.providers[0].credentialRef, "env:OPENAI_MAIN_API_KEY");
  assert.equal(config.providers[0].credentialValue, undefined);
  assert.equal(config.providers[1].authScheme, "x-api-key");
  assert.equal(config.providers[1].credentialEnv, "ANTHROPIC_MAIN_API_KEY");
  assert.deepEqual(config.profiles[0].allowedModels, ["gpt-4.1-mini"]);
  assert.deepEqual(config.pluginPolicies[0].enabledPluginIds, ["context-compressor-plugin"]);
  assert.deepEqual(config.agents[0].allowedModels, ["gpt-4.1-mini"]);
  assert.deepEqual(config.agents[0].enabledPluginIds, ["context-compressor-plugin"]);
});

test("rejects inline credentials and ambiguous secret fields", () => {
  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "inline", baseUrl: "https://api.openai.com/v1", auth: { credential: "fixture-inline-secret" } }]
  })), /inline credentials are not allowed/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad", baseUrl: "https://api.openai.com/v1", auth: { apiKey: "fixture-inline-secret" } }]
  })), /forbidden secret field/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "bad", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "fixture-inline-secret" } }]
  })), /invalid credentialRef/);

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

test("rejects unsafe provider target URLs", () => {
  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "query", baseUrl: "https://api.openai.com/v1?token=secret" }]
  })), /unsafe URL/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "userinfo", baseUrl: "https://user:pass@api.openai.com/v1" }]
  })), /unsafe URL/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "loopback", baseUrl: "http://127.0.0.1:11434/v1", auth: { credentialRef: "env:OPENAI_API_KEY" } }]
  })), /unsafe private URL/);
});

test("parses local Claude CLI providers from JSON", () => {
  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{
      id: "claude-local",
      name: "Claude Local",
      kind: "cli-claude",
      command: "claude",
      args: ["--print"],
      inputMode: "argument",
      allowUnsafeArgumentInput: true,
      timeoutMs: 30000
    }]
  }));

  const provider = config.providers[0];
  assert.equal(config.target, "cli://claude-local");
  assert.equal(config.activeProviderId, "claude-local");
  assert.equal(provider.kind, "cli");
  assert.equal(provider.runtime, "claude");
  assert.equal(provider.cliCommand, "claude");
  assert.deepEqual(provider.cliArgs, ["--print"]);
  assert.equal(provider.cliInputMode, "argument");
  assert.equal(provider.cliTimeoutMs, 30000);
  assert.equal(provider.credentialRef, "none");
});

test("parses local Codex CLI providers from JSON", () => {
  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "codex-local", kind: "cli-codex", inputMode: "stdin" }]
  }));

  const provider = config.providers[0];
  assert.equal(config.target, "cli://codex-local");
  assert.equal(provider.kind, "cli");
  assert.equal(provider.runtime, "codex");
  assert.equal(provider.cliCommand, "codex");
  assert.deepEqual(provider.cliArgs, ["exec"]);
  assert.equal(provider.credentialRef, "none");
});

test("parses Ollama local providers with the loopback default", () => {
  const config = parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "ollama-dev", kind: "ollama" }]
  }));

  const provider = config.providers[0];
  assert.equal(provider.kind, "local");
  assert.equal(provider.target, "http://127.0.0.1:11434/v1");
  assert.equal(provider.authScheme, "none");
  assert.equal(provider.protocol, "ollama-tags");
});

test("rejects duplicate provider IDs and unknown agent bindings", () => {
  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [
      { id: "openai-main", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } },
      { id: "openai-main", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } }
    ]
  })), /duplicate provider id/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "openai-main", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } }],
    profiles: [{ id: "default-local", providerId: "openai-main" }],
    agents: [{ id: "ci", profileId: "missing" }]
  })), /unknown profile in agent/);
});

test("rejects malformed policy and agent records", () => {
  const provider = { id: "openai-main", baseUrl: "https://api.openai.com/v1", auth: { credentialRef: "none" } };
  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [provider],
    pluginPolicies: [{ id: "standard" }, { id: "standard" }]
  })), /duplicate plugin policy id/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [provider],
    pluginPolicies: [{ id: "standard", enabledPluginIds: ["missing-plugin"] }]
  })), /unknown enabled plugin id/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [provider],
    agents: [{ id: "ci", providerId: "openai-main" }, { id: "ci", providerId: "openai-main" }]
  })), /duplicate agent id/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ ...provider, enabled: false }],
    agents: [{ id: "ci", providerId: "openai-main" }]
  })), /agent provider disabled/);

  assert.throws(() => parseMolenkopfConfigJson(JSON.stringify({
    schemaVersion: 1,
    providers: [{ id: "cli", kind: "cli-claude", inputMode: "argument" }]
  })), /unsafe CLI inputMode/);
});
