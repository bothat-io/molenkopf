import test from "node:test";
import assert from "node:assert/strict";
import { deriveClientIdentity } from "../src/http/client-identity.ts";
import { buildForwardHeaders } from "../src/http/header-utils.ts";

test("client identity ignores spoofed local headers and never forwards them", () => {
  const headers = new Headers({ "x-molenkopf-role": "admin", "x-molenkopf-agent": "codex-local", authorization: "Bearer fixture-secret" });
  const identity = deriveClientIdentity(headers);
  assert.equal(identity.id, "agent:codex-local");
  assert.equal(identity.label, "agent:codex-local");
  const forwarded = buildForwardHeaders(headers);
  assert.equal(forwarded.has("x-molenkopf-role"), false);
  assert.equal(forwarded.has("x-molenkopf-agent"), false);
  assert.equal(forwarded.get("authorization"), null);
});

test("client identity falls back to API key fingerprint without storing the key", () => {
  const identity = deriveClientIdentity(new Headers({ "x-api-key": "fixture-client-secret" }));
  assert.match(identity.id, /^api-key:[a-f0-9]{12}$/);
  assert.equal(identity.label.includes("fixture-client-secret"), false);
});
