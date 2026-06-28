import test from "node:test";
import assert from "node:assert/strict";
import { resolveCliTarget } from "../src/cli/target.ts";

test("CLI target validation rejects unsafe default provider URLs", () => {
  assert.throws(() => resolveCliTarget(new Map([["target", "file:///tmp/model"]])), /invalid target/);
  assert.throws(() => resolveCliTarget(new Map([["target", "http://user:pass@example.test/v1"]])), /invalid target/);
  assert.throws(() => resolveCliTarget(new Map(), { OPENAI_BASE_URL: "https://api.example.test/v1?token=secret" }), /invalid target/);
});

test("CLI target validation keeps explicit local development targets", () => {
  assert.equal(resolveCliTarget(new Map([["target", "http://127.0.0.1:11434/v1"]])), "http://127.0.0.1:11434/v1");
  assert.equal(resolveCliTarget(new Map(), { OPENAI_BASE_URL: "https://api.openai.com/v1" }), "https://api.openai.com/v1");
});
