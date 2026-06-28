import test from "node:test";
import assert from "node:assert/strict";
import { resolveRequestPluginIds } from "../src/http/runtime-state.ts";
import { pluginPolicySchemaVersion } from "../../core/src/plugins/plugin-policy.ts";

test("request plugin selection never relies on legacy pluginEnabled as source-of-truth", () => {
  const state = {
    pluginEnabled: { "context-compressor-plugin": false, "token-optimizer-plugin": false },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {},
      teamPluginPolicies: []
    }
  } as any;

  const plugins = resolveRequestPluginIds(state, ["team-a"]);
  assert.equal(plugins.includes("token-optimizer-plugin"), true);
  assert.equal(plugins.includes("context-compressor-plugin"), false);
});
