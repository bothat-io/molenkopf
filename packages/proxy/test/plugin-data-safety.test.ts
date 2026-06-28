import test from "node:test";
import assert from "node:assert/strict";
import { buildPluginData } from "../src/http/plugin-data.ts";
import { createRuntimeState } from "../src/http/runtime-state.ts";
import { pluginPolicySchemaVersion } from "../../core/src/plugins/plugin-policy.ts";

test("generic plugin data route treats plugin output as untrusted and sanitizes it", async () => {
  const state = createRuntimeState({ target: "http://127.0.0.1:1/v1" }, "127.0.0.1");
  state.pluginPolicyState = {
    pluginPolicySchemaVersion,
    globalPluginPolicy: { "token-optimizer-plugin": { enabled: true } },
    teamPluginPolicies: []
  };
  const result = await buildPluginData("token-optimizer-plugin", fakeAudit(), state, undefined, {
    data: async () => ({ ok: true, payload: { Authorization: "Bearer secret", nested: { cookie: "sid=secret" }, public: "ok" } })
  } as any);
  assert.equal(result.status, 200);
  assert.equal((result.payload as any).public, "ok");
  assert.doesNotMatch(JSON.stringify(result.payload), /Bearer secret|sid=secret/);
});

function fakeAudit() {
  return { listPage: async () => ({ items: [] }) } as any;
}
