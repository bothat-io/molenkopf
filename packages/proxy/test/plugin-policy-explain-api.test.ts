import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("single-plugin explain API reports blocked reasons and override sources", async () => {
  const env = await startPolicyProxy("molenkopf-policy-explain-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "context-compressor-plugin": { enabled: false } }
    }, admin);
    const rejected = await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", {
      pluginPolicies: { "context-compressor-plugin": { enabled: true } }
    }, admin);
    assert.equal(rejected.status, 400);

    const payload = await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha/context-compressor-plugin", admin).then((res) => res.json());
    assert.equal(payload.pluginId, "context-compressor-plugin");
    assert.equal(payload.globalOverrideExists, true);
    assert.equal(payload.teamOverrideExists, false);
    assert.equal(payload.policy.enabled, false);
    assert.ok(Array.isArray(payload.policy.blockedReasons));
  } finally {
    await env.close();
  }
});
