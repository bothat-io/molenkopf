import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginPolicyState } from "../src/plugins/plugin-policy.ts";
import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const descriptor: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "Context Compressor",
  category: "compression",
  risk: "yellow",
  capabilities: ["metadata:read", "settings:read"],
  settingsSchema: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "yellow",
    capabilities: ["metadata:read", "settings:read"],
    settings: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
    actions: []
  },
  modulePath: "plugin.ts"
};

test("Invalid persisted policy state is quarantined to safe defaults with warnings", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 2,
    globalPluginPolicy: { "context-compressor-plugin": { enabled: "yes", maxRisk: "blue" } },
    teamPluginPolicies: [
      { teamId: "team-a", pluginId: "context-compressor-plugin", overrides: { enabled: true, maxRisk: "invalid" } }
    ]
  }, [descriptor]);

  assert.equal(state.ok, false);
  assert.equal(state.state.globalPluginPolicy["context-compressor-plugin"].enabled, undefined);
  assert.equal(state.warnings.includes("policy-version-mismatch:2"), true);
  assert.equal(state.state.globalPluginPolicy["context-compressor-plugin"].maxRisk, undefined);
});
