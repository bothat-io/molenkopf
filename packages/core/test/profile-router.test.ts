import test from "node:test";
import assert from "node:assert/strict";
import { chooseProfile, readCredential } from "../src/profiles/profile-router.ts";

test("chooses profiles with fixed, manual, and failover routing", () => {
  const profiles = [
    { name: "primary", target: "https://one.test/v1", healthy: false },
    { name: "backup", target: "https://two.test/v1", healthy: true }
  ];
  assert.equal(chooseProfile({ mode: "fixed", profile: "primary", profiles }).name, "primary");
  assert.equal(chooseProfile({ mode: "manual", profile: "backup", profiles }).name, "backup");
  assert.equal(chooseProfile({ mode: "failover", profiles }).name, "backup");
});

test("fixed and manual routing require explicit profiles", () => {
  const profiles = [{ name: "primary", target: "https://one.test/v1" }];
  assert.throws(() => chooseProfile({ mode: "fixed", profiles }), /explicit profile required/);
  assert.throws(() => chooseProfile({ mode: "manual", profiles }), /explicit profile required/);
});

test("reads credentials from env without storing values in profile objects", () => {
  const env = { OPENAI_API_KEY: "secret-value" };
  assert.equal(readCredential({ envKey: "OPENAI_API_KEY" }, env), "secret-value");
  assert.deepEqual({ envKey: "OPENAI_API_KEY" }, { envKey: "OPENAI_API_KEY" });
});
