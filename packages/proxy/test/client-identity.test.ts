import test from "node:test";
import assert from "node:assert/strict";
import { deriveClientIdentity } from "../src/http/client-identity.ts";
import { buildForwardHeaders } from "../src/http/header-utils.ts";

test("client identity prefers explicit user and never forwards local attribution headers", () => {
  const headers = new Headers({ "x-molenkopf-user": "Example Admin", authorization: "Bearer fixture-secret" });
  const identity = deriveClientIdentity(headers);
  assert.equal(identity.id, "user:example-admin");
  assert.equal(identity.label, "user:Example Admin");
  const forwarded = buildForwardHeaders(headers);
  assert.equal(forwarded.has("x-molenkopf-user"), false);
  assert.equal(forwarded.get("authorization"), null);
});

test("client identity falls back to API key fingerprint without storing the key", () => {
  const identity = deriveClientIdentity(new Headers({ "x-api-key": "fixture-client-secret" }));
  assert.match(identity.id, /^api-key:[a-f0-9]{12}$/);
  assert.equal(identity.label.includes("fixture-client-secret"), false);
});
