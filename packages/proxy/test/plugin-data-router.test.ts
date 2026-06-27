import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("generic plugin data route returns contract errors for missing plugins and keeps workspace data readable when disabled", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-data-router-");
  try {
    const admin = await setupAdmin(env.base);

    const missing = await getAuth(env.base, "/__molenkopf/plugins/missing/data", admin);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "plugin_not_found" });

    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "obsidian-graph-plugin": { enabled: false } }
    }, admin);
    const disabled = await getAuth(env.base, "/__molenkopf/plugins/obsidian-graph-plugin/data", admin);
    assert.equal(disabled.status, 200);
    const payload = await disabled.json();
    assert.equal(payload.plugin.id, "obsidian-graph-plugin");
  } finally {
    await env.close();
  }
});
