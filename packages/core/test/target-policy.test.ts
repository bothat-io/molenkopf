import test from "node:test";
import assert from "node:assert/strict";
import { resolveConnectTarget, validateProviderTarget } from "../src/security/target-policy.ts";

test("target policy rejects private and metadata remote targets", () => {
  for (const target of [
    "http://127.0.0.1:11434/v1",
    "http://2130706433/v1",
    "http://169.254.169.254/latest",
    "http://[::1]/v1",
    "http://[::ffff:127.0.0.1]/v1",
    "http://metadata.google.internal/v1"
  ]) {
    assert.throws(() => validateProviderTarget(target), /unsafe private URL/);
  }
});

test("target policy permits explicit local private targets", () => {
  assert.equal(validateProviderTarget("http://127.0.0.1:11434/v1", { allowPrivate: true }), "http://127.0.0.1:11434/v1");
});

test("target policy rejects DNS names that resolve to private addresses before connect", async () => {
  await assert.rejects(resolveConnectTarget("http://localhost:11434/v1"), /unsafe private URL/);
  const local = await resolveConnectTarget("http://localhost:11434/v1", { allowPrivate: true });
  assert.match(local.address, /^(127\.|::1)/);
});
