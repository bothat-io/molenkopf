import test from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/security/secret-redactor.ts";

test("redacts known secret formats and keeps stable hash markers", () => {
  const openAiKey = ["s", "k"].join("") + "-proj-" + "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJK";
  const anthropicKey = ["s", "k"].join("") + "-ant-" + "api03-" + "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG";
  const githubToken = "ghp_" + "abcdefghijklmnopqrstuvwxyz1234567890";
  const privateKey = "-----BEGIN " + "PRIVATE KEY-----\nabc\n-----END " + "PRIVATE KEY-----";
  const input = [
    openAiKey,
    anthropicKey,
    githubToken,
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signedPayload",
    privateKey,
    "Authorization: Bearer super-secret-token",
    "Cookie: sid=abc; token=def",
    "password=hunter2 token=abc secret=def api_key=ghi"
  ].join("\n");

  const first = redactSecrets(input);
  const second = redactSecrets(input);
  assert.equal(first.text, second.text);
  assert.match(first.text, /\[REDACTED_SECRET:openai_api_key:sha256:[a-f0-9]{12}\]/);
  assert.match(first.text, /\[REDACTED_SECRET:anthropic_api_key:sha256:[a-f0-9]{12}\]/);
  assert.match(first.text, /\[REDACTED_SECRET:github_token:sha256:[a-f0-9]{12}\]/);
  assert.match(first.text, /\[REDACTED_SECRET:jwt:sha256:[a-f0-9]{12}\]/);
  assert.match(first.text, /\[REDACTED_SECRET:private_key:sha256:[a-f0-9]{12}\]/);
  assert.doesNotMatch(first.text, /hunter2|super-secret-token|sid=abc/);
});

test("redacts query-style secrets inside JSON without consuming JSON delimiters", () => {
  const result = redactSecrets(JSON.stringify({
    note: "token=render-secret-0",
    password_hint: "password=hunter2",
    url: "https://example.test/run?api_key=abc123&next=1"
  }));
  const parsed = JSON.parse(result.text);
  assert.match(parsed.note, /^token=\[REDACTED_SECRET:token:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.password_hint, /^\[REDACTED_SECRET:json_password_hint:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.url, /api_key=\[REDACTED_SECRET:api_key:sha256:[a-f0-9]{12}\]&next=1$/);
  assert.doesNotMatch(result.text, /render-secret-0|hunter2|abc123/);
});

test("redacts sensitive JSON keys with ordinary string values", () => {
  const result = redactSecrets(JSON.stringify({
    password: "plain-password",
    nested: { refresh_token: "plain-refresh", authorization: "Bearer plain-auth", accessToken: "plain-access" },
    items: [{ credential: "plain-credential", apiKey: "plain-api", "client-secret": "plain-client-secret" }]
  }));
  const parsed = JSON.parse(result.text);
  assert.match(parsed.password, /^\[REDACTED_SECRET:json_password:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.nested.refresh_token, /^\[REDACTED_SECRET:json_refresh_token:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.nested.authorization, /^\[REDACTED_SECRET:json_authorization:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.nested.accessToken, /^\[REDACTED_SECRET:json_accesstoken:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.items[0].credential, /^\[REDACTED_SECRET:json_credential:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.items[0].apiKey, /^\[REDACTED_SECRET:json_apikey:sha256:[a-f0-9]{12}\]$/);
  assert.match(parsed.items[0]["client-secret"], /^\[REDACTED_SECRET:json_client_secret:sha256:[a-f0-9]{12}\]$/);
  assert.doesNotMatch(result.text, /plain-password|plain-refresh|plain-auth|plain-access|plain-credential|plain-api|plain-client-secret/);
});

test("redacts JSON string spans without rewriting unrelated JSON syntax", () => {
  const input = '{\n  "unsafe": 9007199254740993,\n  "negativeZero": -0,\n  "dup": "first",\n  "dup": "second",\n  "secret": "plain-secret",\n  "escaped": "\\u003c"\n}';
  const result = redactSecrets(input);
  assert.match(result.text, /"unsafe": 9007199254740993/);
  assert.match(result.text, /"negativeZero": -0/);
  assert.match(result.text, /"dup": "first"[\s\S]*"dup": "second"/);
  assert.match(result.text, /"escaped": "\\u003c"/);
  assert.doesNotMatch(result.text, /plain-secret/);
  assert.match(result.text, /"secret": "\[REDACTED_SECRET:json_secret:sha256:[a-f0-9]{12}\]"/);
});

test("redacts env-style secret assignments", () => {
  const result = redactSecrets([
    "DB_PASSWORD=hunter2",
    "AWS_SECRET_ACCESS_KEY=aws-secret-value",
    "MY_TOKEN: token-value",
    "PUBLIC_FLAG=true"
  ].join("\n"));
  assert.doesNotMatch(result.text, /hunter2|aws-secret-value|token-value/);
  assert.match(result.text, /DB_PASSWORD=\[REDACTED_SECRET:env_secret/);
  assert.match(result.text, /AWS_SECRET_ACCESS_KEY=\[REDACTED_SECRET:env_secret/);
  assert.match(result.text, /MY_TOKEN: \[REDACTED_SECRET:env_secret/);
  assert.match(result.text, /PUBLIC_FLAG=true/);
});

test("redacts extended service tokens and secret-bearing URLs", () => {
  const input = [
    "Authorization: Basic " + "dXNlcjpwYXNz",
    "glpat-" + "a".repeat(24),
    "npm_" + "b".repeat(36),
    "xoxb-" + "1".repeat(12) + "-" + "2".repeat(12) + "-" + "c".repeat(24),
    "sk_" + "live_" + "d".repeat(24),
    "AIza" + "e".repeat(35),
    "postgres://app:db-pass@db.internal:5432/app",
    "https://user:pass@example.test/path",
    "https://" + "f".repeat(32) + "@o123.ingest.sentry.io/456",
    "AccountKey=" + "g".repeat(44),
    "refresh_token=refresh-value client_secret=client-value"
  ].join("\n");
  const result = redactSecrets(input);
  for (const leaked of ["dXNlcjpwYXNz", "db-pass", "user:pass", "refresh-value", "client-value"]) {
    assert.doesNotMatch(result.text, new RegExp(leaked));
  }
  for (const kind of ["authorization_basic", "gitlab_token", "npm_token", "slack_token", "stripe_secret", "google_api_key", "db_url", "basic_auth_url", "sentry_dsn", "account_key", "sensitive_assignment"]) {
    assert.match(result.text, new RegExp(`REDACTED_SECRET:${kind}:sha256:[a-f0-9]{12}`));
  }
});
