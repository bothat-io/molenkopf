import test from "node:test";
import assert from "node:assert/strict";
import { chooseByDistribution, weightShares } from "../src/routing/distribution.ts";

test("equal weights spread tokens fairly", () => {
  // a is loaded, b is idle -> next request goes to b
  assert.equal(chooseByDistribution([{ id: "a", weight: 1, usedTokens: 100 }, { id: "b", weight: 1, usedTokens: 0 }]), "b");
});

test("80/20 weights hold the configured ratio", () => {
  // both idle -> the heavier-weighted provider is chosen first
  assert.equal(chooseByDistribution([{ id: "big", weight: 4, usedTokens: 0 }, { id: "small", weight: 1, usedTokens: 0 }]), "big");
  // once big has its ~80% share, small is due
  assert.equal(chooseByDistribution([{ id: "big", weight: 4, usedTokens: 80 }, { id: "small", weight: 1, usedTokens: 5 }]), "small");
});

test("zero-weight providers are excluded", () => {
  assert.equal(chooseByDistribution([{ id: "off", weight: 0, usedTokens: 0 }, { id: "on", weight: 1, usedTokens: 999 }]), "on");
});

test("no eligible providers returns undefined", () => {
  assert.equal(chooseByDistribution([{ id: "off", weight: 0, usedTokens: 0 }]), undefined);
});

test("weightShares reports percent split", () => {
  assert.deepEqual(weightShares([{ id: "big", weight: 4 }, { id: "small", weight: 1 }]), { big: 80, small: 20 });
});
