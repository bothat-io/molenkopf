import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("effective policy view exposes override presence and effective source data", async () => {
  const env = await startPolicyProxy("molenkopf-policy-effective-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "token-optimizer-plugin": { enabled: true } }
    }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", {
      pluginPolicies: { "token-optimizer-plugin": { enabled: false } }
    }, admin);

    const payload = await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha", admin).then((res) => res.json());
    const optimizer = payload.policies["token-optimizer-plugin"];
    assert.equal(optimizer.pluginId, "token-optimizer-plugin");
    assert.equal(optimizer.globalOverrideExists, true);
    assert.equal(optimizer.teamOverrideExists, true);
    assert.equal(optimizer.policy.enabled, false);
    assert.equal(optimizer.policy.source.enabled, "team");
  } finally {
    await env.close();
  }
});
