import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEAM_ID,
  effectivePolicyTeamIds,
  nonDefaultTeamIds,
  scopedIdentityTeamIds,
  uniqueTeamIds
} from "../../core/src/identity/team-scope.ts";

test("team-scope helpers normalize default and specific team sets", () => {
  assert.equal(DEFAULT_TEAM_ID, "everyone");
  assert.deepEqual(uniqueTeamIds(["everyone", "alpha", "alpha", "", 7]), ["everyone", "alpha"]);
  assert.deepEqual(nonDefaultTeamIds(["everyone", "alpha", "beta"]), ["alpha", "beta"]);
  assert.deepEqual(nonDefaultTeamIds(["everyone"]), []);
  assert.deepEqual(effectivePolicyTeamIds(["everyone"]), ["everyone"]);
  assert.deepEqual(effectivePolicyTeamIds(["everyone", "alpha", "beta"]), ["alpha", "beta"]);
  assert.deepEqual(effectivePolicyTeamIds([]), []);
});

test("scoped identity teams keep default membership from widening key scope", () => {
  assert.deepEqual(scopedIdentityTeamIds(["everyone"], undefined), ["everyone"]);
  assert.deepEqual(scopedIdentityTeamIds(["everyone", "alpha"], undefined), ["alpha"]);
  assert.deepEqual(scopedIdentityTeamIds(["everyone", "alpha"], "everyone"), ["alpha"]);
  assert.deepEqual(scopedIdentityTeamIds(["everyone", "alpha", "beta"], "beta"), ["beta"]);
  assert.deepEqual(scopedIdentityTeamIds(["everyone", "alpha"], "missing"), []);
});
