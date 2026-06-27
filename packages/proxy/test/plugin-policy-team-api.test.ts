import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("team plugin policy API stores team overrides and rejects global expansion", async () => {
  const env = await startPolicyProxy("molenkopf-policy-team-");
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
    assert.equal((await rejected.json()).error, "plugin_policy_exceeds_global");

    const accepted = await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", {
      pluginPolicies: { "obsidian-graph-plugin": { enabled: false } }
    }, admin);
    assert.equal(accepted.status, 200);

    const team = await getAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", admin).then((res) => res.json());
    assert.equal(team.teamId, "alpha");
    assert.equal(team.pluginPolicies["obsidian-graph-plugin"].enabled, false);
    assert.equal(team.pluginPolicies["context-compressor-plugin"], undefined);
  } finally {
    await env.close();
  }
});
