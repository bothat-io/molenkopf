import test from "node:test";
import assert from "node:assert/strict";
import { postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("generic plugin action route returns contract errors for missing, disabled, and actionless plugins", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-action-router-");
  try {
    const admin = await setupAdmin(env.base);

    const missing = await postAuth(env.base, "/__molenkopf/plugins/missing/actions/run", {}, admin);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "plugin_not_found" });

    const noAction = await postAuth(env.base, "/__molenkopf/plugins/token-optimizer-plugin/actions/run", {}, admin);
    assert.equal(noAction.status, 404);
    assert.deepEqual(await noAction.json(), { error: "plugin_action_not_found" });

    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "token-optimizer-plugin": { enabled: false } }
    }, admin);
    const disabled = await postAuth(env.base, "/__molenkopf/plugins/token-optimizer-plugin/actions/run", {}, admin);
    assert.equal(disabled.status, 403);
    assert.deepEqual(await disabled.json(), { error: "plugin_disabled" });
  } finally {
    await env.close();
  }
});
