import test from "node:test";
import assert from "node:assert/strict";
import { buildForwardHeaders, missingProviderCredential, sanitizeHeadersForAudit } from "../src/http/header-utils.ts";

test("forwards safe headers and strips client credentials by default", () => {
  const headers = new Headers({
    authorization: "Bearer secret",
    cookie: "sid=1",
    connection: "keep-alive",
    "set-cookie": "sid=provider",
    forwarded: "for=evil",
    "content-type": "application/json",
    "x-custom": "yes"
  });
  const out = buildForwardHeaders(headers);
  assert.equal(out.get("authorization"), null);
  assert.equal(out.get("cookie"), null);
  assert.equal(out.get("content-type"), "application/json");
  assert.equal(out.get("connection"), null);
  assert.equal(out.get("set-cookie"), null);
  assert.equal(out.get("forwarded"), null);
});

test("strips inbound content-length before forwarding", () => {
  const out = buildForwardHeaders(new Headers({
    "content-length": "999",
    "content-type": "application/json"
  }));

  assert.equal(out.get("content-length"), null);
  assert.equal(out.get("content-type"), "application/json");
});

test("transparent default provider forwards caller API credentials but not cookies", () => {
  const out = buildForwardHeaders(new Headers({
    authorization: "Bearer client-secret",
    cookie: "sid=1",
    "x-api-key": "client-api-key"
  }), {
    id: "default",
    name: "Default upstream",
    kind: "api",
    target: "https://api.example.test/v1",
    authScheme: "none"
  });

  assert.equal(out.get("authorization"), "Bearer client-secret");
  assert.equal(out.get("x-api-key"), "client-api-key");
  assert.equal(out.get("cookie"), null);
});

test("client credential passthrough must be explicit", () => {
  const out = buildForwardHeaders(new Headers({ authorization: "Bearer secret", cookie: "sid=1" }), {
    id: "passthrough",
    name: "Passthrough",
    kind: "api",
    target: "https://api.example.test/v1",
    authScheme: "none",
    allowClientCredentialForwarding: true
  });
  assert.equal(out.get("authorization"), "Bearer secret");
  assert.equal(out.get("cookie"), null);
});

test("env provider credentials replace incoming auth at the forwarding boundary", () => {
  const headers = new Headers({
    authorization: "Bearer client-secret",
    cookie: "sid=1",
    "x-api-key": "client-api-key",
    "x-molenkopf-token": "mk_local",
    "content-type": "application/json"
  });
  const out = buildForwardHeaders(headers, {
    id: "openai-main",
    name: "OpenAI Main",
    kind: "api",
    target: "https://api.openai.com/v1",
    credentialEnv: "OPENAI_MAIN_API_KEY",
    authScheme: "bearer"
  }, { OPENAI_MAIN_API_KEY: "server-secret" });

  assert.equal(out.get("authorization"), "Bearer server-secret");
  assert.equal(out.get("x-api-key"), null);
  assert.equal(out.get("cookie"), null);
  assert.equal(out.get("x-molenkopf-token"), null);
  assert.equal(out.get("content-type"), "application/json");
});

test("x-api-key provider credentials are injected without bearer prefix", () => {
  const out = buildForwardHeaders(new Headers({ authorization: "Bearer client-secret" }), {
    id: "claude-main",
    name: "Claude Main",
    kind: "api",
    target: "https://api.anthropic.com/v1",
    credentialEnv: "ANTHROPIC_MAIN_API_KEY",
    authScheme: "x-api-key"
  }, { ANTHROPIC_MAIN_API_KEY: "server-secret" });

  assert.equal(out.get("authorization"), null);
  assert.equal(out.get("x-api-key"), "server-secret");
});

test("missing env provider credentials do not fall back to client auth", () => {
  const provider = {
    id: "openai-main",
    name: "OpenAI Main",
    kind: "api" as const,
    target: "https://api.openai.com/v1",
    credentialEnv: "OPENAI_MAIN_API_KEY",
    authScheme: "bearer" as const
  };
  const out = buildForwardHeaders(new Headers({ authorization: "Bearer client-secret" }), {
    ...provider
  }, {});

  assert.equal(missingProviderCredential(provider, {}), true);
  assert.equal(out.get("authorization"), null);
});

test("JSON secret refs strip client auth until a resolver provides credentials", () => {
  const out = buildForwardHeaders(new Headers({ authorization: "Bearer client-secret", cookie: "sid=1" }), {
    id: "openai-main",
    name: "OpenAI Main",
    kind: "api",
    target: "https://api.openai.com/v1",
    credentialRef: "secret:openai-main",
    authScheme: "bearer"
  }, {});

  assert.equal(out.get("authorization"), null);
  assert.equal(out.get("cookie"), null);
});

test("runtime provider credentials replace incoming client auth", () => {
  const out = buildForwardHeaders(new Headers({ authorization: "Bearer client-secret", cookie: "sid=1" }), {
    id: "openai-main",
    name: "OpenAI Main",
    kind: "api",
    target: "https://api.openai.com/v1",
    credentialRef: "json:inline",
    credentialValue: "json-secret",
    authScheme: "bearer"
  }, {});

  assert.equal(out.get("authorization"), "Bearer json-secret");
  assert.equal(out.get("cookie"), null);
});

test("provider id default does not bypass credential injection", () => {
  const provider = {
    id: "default",
    name: "Configured default",
    kind: "api" as const,
    target: "https://api.openai.com/v1",
    credentialEnv: "DEFAULT_KEY",
    authScheme: "bearer" as const
  };
  const out = buildForwardHeaders(new Headers({ authorization: "Bearer client-secret" }), provider, { DEFAULT_KEY: "server-secret" });
  assert.equal(out.get("authorization"), "Bearer server-secret");
  assert.equal(missingProviderCredential(provider, {}), true);
});

test("named no-auth local providers strip client credentials", () => {
  const out = buildForwardHeaders(new Headers({
    authorization: "Bearer client-secret",
    cookie: "sid=1",
    "x-api-key": "client-api-key",
    "content-type": "application/json"
  }), {
    id: "ollama-local",
    name: "Ollama",
    kind: "local",
    target: "http://127.0.0.1:11434/v1",
    authScheme: "none"
  });

  assert.equal(out.get("authorization"), null);
  assert.equal(out.get("cookie"), null);
  assert.equal(out.get("x-api-key"), null);
  assert.equal(out.get("content-type"), "application/json");
});

test("audit header sanitization removes credentials", () => {
  const safe = sanitizeHeadersForAudit(new Headers({ authorization: "Bearer secret", cookie: "sid=1" }));
  assert.deepEqual(safe, {});
});
