import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderCatalog, viewProviders } from "../src/providers/provider-catalog.ts";

test("env provider profiles are selectable by API key without exposing values", () => {
  const env = { OPENAI_API_KEY: "fixture-openai-value", ANTHROPIC_API_KEY: "fixture-anthropic-value" };
  const providers = buildProviderCatalog("http://127.0.0.1:9999/v1", [], env);
  const views = viewProviders(providers, "default", env);
  const openai = views.find((provider) => provider.id === "openai-env");
  const anthropic = views.find((provider) => provider.id === "anthropic-env");

  assert.equal(openai?.enabled, true);
  assert.equal(openai?.credentialConfigured, true);
  assert.equal(openai?.selectable, true);
  assert.equal(anthropic?.enabled, true);
  assert.equal(anthropic?.credentialConfigured, true);
  assert.equal(anthropic?.selectable, true);
  assert.doesNotMatch(JSON.stringify(views), /fixture-openai-value|fixture-anthropic-value/);
});

test("builds multiple named provider profiles from env without storing credential values", () => {
  const env = {
    MOLENKOPF_PROVIDER_IDS: "openai-main, claude-team",
    MOLENKOPF_PROVIDER_OPENAI_MAIN_NAME: "OpenAI Main",
    MOLENKOPF_PROVIDER_OPENAI_MAIN_TARGET: "https://api.openai.com/v1",
    MOLENKOPF_PROVIDER_OPENAI_MAIN_CREDENTIAL_ENV: "OPENAI_MAIN_API_KEY",
    MOLENKOPF_PROVIDER_CLAUDE_TEAM_NAME: "Claude Team",
    MOLENKOPF_PROVIDER_CLAUDE_TEAM_TARGET: "https://api.anthropic.com/v1",
    MOLENKOPF_PROVIDER_CLAUDE_TEAM_CREDENTIAL_ENV: "ANTHROPIC_TEAM_API_KEY",
    MOLENKOPF_PROVIDER_CLAUDE_TEAM_AUTH: "x-api-key",
    OPENAI_MAIN_API_KEY: "fixture-openai-main-secret",
    ANTHROPIC_TEAM_API_KEY: "fixture-anthropic-team-secret"
  };
  const providers = buildProviderCatalog("http://127.0.0.1:9999/v1", [], env);
  const views = viewProviders(providers, "openai-main", env);

  assert.equal(views.find((item) => item.id === "openai-main")?.name, "OpenAI Main");
  assert.equal(views.find((item) => item.id === "openai-main")?.authScheme, "bearer");
  assert.equal(views.find((item) => item.id === "claude-team")?.authScheme, "x-api-key");
  assert.equal(views.find((item) => item.id === "claude-team")?.credentialConfigured, true);
  assert.doesNotMatch(JSON.stringify(views), /fixture-openai-main-secret|fixture-anthropic-team-secret/);
});

test("env providers infer Anthropic auth from protocol and normalized host", () => {
  const providers = buildProviderCatalog("http://127.0.0.1:9999/v1", [], {
    MOLENKOPF_PROVIDER_IDS: "claude-protocol, claude-upper",
    MOLENKOPF_PROVIDER_CLAUDE_PROTOCOL_TARGET: "https://llm-proxy.example/v1",
    MOLENKOPF_PROVIDER_CLAUDE_PROTOCOL_PROTOCOL: "anthropic-messages",
    MOLENKOPF_PROVIDER_CLAUDE_PROTOCOL_CREDENTIAL_ENV: "CLAUDE_PROTOCOL_KEY",
    MOLENKOPF_PROVIDER_CLAUDE_UPPER_TARGET: "https://API.ANTHROPIC.COM/v1",
    MOLENKOPF_PROVIDER_CLAUDE_UPPER_CREDENTIAL_ENV: "CLAUDE_UPPER_KEY"
  });

  assert.equal(providers.find((item) => item.id === "claude-protocol")?.authScheme, "x-api-key");
  assert.equal(providers.find((item) => item.id === "claude-upper")?.protocol, "anthropic-messages");
  assert.equal(providers.find((item) => item.id === "claude-upper")?.authScheme, "x-api-key");
});

test("explicit provider catalogs do not mix env provider blocks", () => {
  const env = {
    MOLENKOPF_PROVIDER_IDS: "env-openai",
    MOLENKOPF_PROVIDER_ENV_OPENAI_TARGET: "https://api.openai.com/v1"
  };
  const providers = buildProviderCatalog("https://ignored.example/v1", [
    { id: "json-openai", name: "JSON OpenAI", kind: "api", target: "https://api.openai.com/v1", credentialRef: "env:OPENAI_JSON_KEY", credentialEnv: "OPENAI_JSON_KEY" }
  ], env, { includeBuiltIns: false, includeEnvProviders: false });

  assert.deepEqual(providers.map((item) => item.id), ["json-openai"]);
});

test("built-in Ollama keeps a safe loopback default", () => {
  const providers = buildProviderCatalog("http://127.0.0.1:9999/v1", [], {});
  const ollama = providers.find((item) => item.id === "ollama-local");

  assert.equal(ollama?.kind, "local");
  assert.equal(ollama?.target, "http://127.0.0.1:11434/v1");
  assert.equal(ollama?.authScheme, "none");
  assert.equal(ollama?.protocol, "ollama-tags");
  assert.equal(ollama?.enabled, false);
});

test("unsafe env provider targets are not enabled or registered", () => {
  const providers = buildProviderCatalog("http://127.0.0.1:9999/v1", [], {
    OPENAI_BASE_URL: "https://user:pass@api.openai.com/v1",
    OPENAI_API_KEY: "fixture-openai-value",
    MOLENKOPF_PROVIDER_IDS: "bad",
    MOLENKOPF_PROVIDER_BAD_TARGET: "https://api.example/v1?token=secret"
  });

  assert.equal(providers.find((item) => item.id === "openai-env")?.enabled, false);
  assert.equal(providers.some((item) => item.id === "bad"), false);
});

test("private env API targets are disabled unless declared local", () => {
  const providers = buildProviderCatalog("http://127.0.0.1:9999/v1", [], {
    OPENAI_BASE_URL: "http://127.0.0.1:9000/v1",
    OPENAI_API_KEY: "fixture-openai-value",
    MOLENKOPF_PROVIDER_IDS: "private-api, private-local",
    MOLENKOPF_PROVIDER_PRIVATE_API_TARGET: "http://127.0.0.1:9001/v1",
    MOLENKOPF_PROVIDER_PRIVATE_LOCAL_KIND: "local",
    MOLENKOPF_PROVIDER_PRIVATE_LOCAL_TARGET: "http://127.0.0.1:9002/v1"
  });

  assert.equal(providers.find((item) => item.id === "openai-env")?.enabled, false);
  assert.equal(providers.some((item) => item.id === "private-api"), false);
  assert.equal(providers.find((item) => item.id === "private-local")?.kind, "local");
});
