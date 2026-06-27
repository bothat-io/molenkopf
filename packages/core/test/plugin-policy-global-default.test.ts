import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginPolicyState, resolveEffectivePluginPolicy } from "../src/plugins/plugin-policy.ts";
import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const descriptor: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "Context Compressor",
  category: "compression",
  risk: "yellow",
  capabilities: ["metadata:read", "body:redacted:read", "settings:read"],
  settingsSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "yellow",
    capabilities: ["metadata:read", "body:redacted:read", "settings:read"],
    settings: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } },
    actions: []
  },
  modulePath: "plugin.ts"
};

test("Global default policy is used when team overrides are absent", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "context-compressor-plugin": { enabled: false, maxRisk: "red", capabilities: ["body:redacted:read"] }
    },
    teamPluginPolicies: []
  }, [descriptor]);

  assert.equal(state.ok, true);
  const effective = resolveEffectivePluginPolicy(descriptor, state.state, undefined);
  assert.equal(effective.enabled, false);
  assert.equal(effective.maxRisk, "red");
  assert.deepEqual(effective.capabilities, ["body:redacted:read"]);
});
