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
        "token-optimizer-plugin": { enabled: true }
      }
    }, admin);
    assert.equal(update.status, 200);
    const after = await update.json();
    assert.equal(after.globalPluginPolicy["context-compressor-plugin"].enabled, true);
    assert.equal(after.globalPluginPolicy["token-optimizer-plugin"].enabled, true);

    const disable = await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: {
        "token-optimizer-plugin": { enabled: false }
      }
    }, admin);
    assert.equal(disable.status, 200);
    const plugins = await getAuth(env.base, "/__molenkopf/plugins", admin).then((res) => res.json());
    const token = plugins.items.find((item: { id: string }) => item.id === "token-optimizer-plugin");
    assert.equal(token.enabled, false);
    assert.equal(token.status, "disabled");
    assert.equal(token.lifecycleStatus, "disabled");
    const stats = await getAuth(env.base, "/__molenkopf/stats", admin).then((res) => res.json());
    assert.equal(stats.pluginEnabled["token-optimizer-plugin"], false);
  } finally {
    await env.close();
  }
});
