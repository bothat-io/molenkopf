import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("resetting team plugin overrides restores inheritance from global", async () => {
  const env = await startPolicyProxy("molenkopf-policy-reset-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "obsidian-graph-plugin": { enabled: true } }
    }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", {
      pluginPolicies: { "obsidian-graph-plugin": { enabled: false } }
    }, admin);

    const overridden = await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha/obsidian-graph-plugin", admin).then((res) => res.json());
    assert.equal(overridden.policy.enabled, false);
    assert.equal(overridden.teamOverrideExists, true);

    const reset = await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", { pluginPolicies: {} }, admin);
    assert.equal(reset.status, 200);

    const inherited = await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha/obsidian-graph-plugin", admin).then((res) => res.json());
    assert.equal(inherited.policy.enabled, true);
    assert.equal(inherited.teamOverrideExists, false);
  } finally {
    await env.close();
  }
});
