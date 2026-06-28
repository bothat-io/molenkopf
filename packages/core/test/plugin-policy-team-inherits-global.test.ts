import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginPolicyState, resolveEffectivePluginPolicy } from "../src/plugins/plugin-policy.ts";
import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const descriptor: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "sample-observer-plugin",
  name: "Sample Observer",
  category: "visualization",
  risk: "green",
  capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
  settingsSchema: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "yellow",
    capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
    settings: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
    actions: []
  },
  workspace: { pagePath: "/__molenkopf/plugins/sample-observer-plugin/page", dataPath: "/__molenkopf/plugins/sample-observer-plugin/data" },
  dataScopes: ["metrics"],
  modulePath: "plugin.ts"
};

test("Team policy absent means team receives global effective policy", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "sample-observer-plugin": { maxRisk: "green", enabled: true }
    },
    teamPluginPolicies: []
  }, [descriptor]);

  const effective = resolveEffectivePluginPolicy(descriptor, state.state, "team-a");
  assert.equal(effective.maxRisk, "green");
  assert.equal(effective.enabled, true);
  assert.equal(effective.source.enabled, "global");
  assert.equal(effective.source.maxRisk, "global");
});
