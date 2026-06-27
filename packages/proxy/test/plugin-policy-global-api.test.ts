import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("global plugin policy API reads and writes validated global defaults", async () => {
  const env = await startPolicyProxy("molenkopf-policy-global-");
  try {
    const admin = await setupAdmin(env.base);
    const before = await getAuth(env.base, "/__molenkopf/plugin-policies/global", admin).then((res) => res.json());
    assert.equal(before.pluginPolicySchemaVersion, 1);

    const update = await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: {
        "context-compressor-plugin": { enabled: true },
        "obsidian-graph-plugin": { enabled: true }
      }
    }, admin);
    assert.equal(update.status, 200);
    const after = await update.json();
    assert.equal(after.globalPluginPolicy["context-compressor-plugin"].enabled, true);
    assert.equal(after.globalPluginPolicy["obsidian-graph-plugin"].enabled, true);
  } finally {
    await env.close();
  }
});
