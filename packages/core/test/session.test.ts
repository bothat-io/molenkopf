import test from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, verifySessionPayload } from "../src/auth/session.ts";

test("session verifier requires canonical two segment tokens", () => {
  const secret = "test-only-session-secret-please-change-123456";
  const token = signSession("admin", secret, 1000, 100, 2);
  assert.equal(verifySession(token, secret, 200), "admin");
  assert.deepEqual(verifySessionPayload(token, secret, 200), { userId: "admin", sessionVersion: 2 });
  assert.equal(verifySession(`${token}.extra`, secret, 200), undefined);
  assert.equal(verifySession(token.replace(".", ".."), secret, 200), undefined);
  assert.equal(verifySession(token.split(".")[0], secret, 200), undefined);
});
