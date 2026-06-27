import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("effective policy view exposes override presence and effective source data", async () => {
  const env = await startPolicyProxy("molenkopf-policy-effective-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "obsidian-graph-plugin": { enabled: true } }
    }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", {
      pluginPolicies: { "obsidian-graph-plugin": { enabled: false } }
    }, admin);

    const payload = await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha", admin).then((res) => res.json());
    const graph = payload.policies["obsidian-graph-plugin"];
    assert.equal(graph.pluginId, "obsidian-graph-plugin");
    assert.equal(graph.globalOverrideExists, true);
    assert.equal(graph.teamOverrideExists, true);
    assert.equal(graph.policy.enabled, false);
    assert.equal(graph.policy.source.enabled, "team");
  } finally {
    await env.close();
  }
});
