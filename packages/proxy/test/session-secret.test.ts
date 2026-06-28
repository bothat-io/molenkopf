import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireSessionSecret } from "../src/http/session-secret.ts";
import { startProxy } from "../src/http/server.ts";

const VALID = "test-8f6e1a9d0c2b4f739ab15c6d8e029471";
const INVALID = [
  undefined,
  "",
  "   ",
  "your-super-secret-key",
  "replace-with-at-least-32-random-characters",
  "changeme",
  "change-me",
  "secret",
  "password",
  "short-secret",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "00000000000000000000000000000000",
  "abcabcabcabcabcabcabcabcabcabcabcabc",
  "test-only-session-secret-please-change-123456"
];

test("session secret is required and rejects placeholders", () => {
  for (const value of INVALID) {
    assert.throws(() => requireSessionSecret({ MOLENKOPF_SESSION_SECRET: value }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /MOLENKOPF_SESSION_SECRET is required/);
      if (typeof value === "string" && value.trim()) assert.doesNotMatch(error.message, new RegExp(escapeRegExp(value)));
      return true;
    });
  }
});

test("session secret accepts a unique 32 character value", () => {
  assert.equal(requireSessionSecret({ MOLENKOPF_SESSION_SECRET: VALID }), VALID);
  assert.equal(requireSessionSecret({ MOLENKOPF_SESSION_SECRET: ` ${VALID} ` }), VALID);
});

test("proxy start fails before listening without a session secret", async () => {
  const previous = process.env.MOLENKOPF_SESSION_SECRET;
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-session-required-"));
  delete process.env.MOLENKOPF_SESSION_SECRET;
  try {
    await assert.rejects(
      startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir }),
      /MOLENKOPF_SESSION_SECRET is required/
    );
  } finally {
    if (previous === undefined) delete process.env.MOLENKOPF_SESSION_SECRET;
    else process.env.MOLENKOPF_SESSION_SECRET = previous;
    await rm(dataDir, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
