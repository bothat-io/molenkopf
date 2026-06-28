import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginPolicyState, resolveEffectivePluginPolicy } from "../src/plugins/plugin-policy.ts";
import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const descriptor: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "Context Compressor",
  category: "compression",
  risk: "red",
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

test("Policy lattice is restrictive and monotonic toward team policy", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "context-compressor-plugin": { maxRisk: "orange", enabled: true, capabilities: ["metadata:read"] }
    },
    teamPluginPolicies: [
      { teamId: "team-a", pluginId: "context-compressor-plugin", overrides: { maxRisk: "yellow", capabilities: ["metadata:read", "settings:read"] } },
      { teamId: "team-b", pluginId: "context-compressor-plugin", overrides: { maxRisk: "red" } }
    ]
  }, [descriptor]);

  const teamA = resolveEffectivePluginPolicy(descriptor, state.state, "team-a");
  const teamB = resolveEffectivePluginPolicy(descriptor, state.state, "team-b");
  assert.equal(teamA.maxRisk, "yellow");
  assert.equal(teamB.maxRisk, "orange");
  assert.deepEqual(teamA.capabilities, ["metadata:read"]);
  assert.equal(teamB.source.maxRisk, "blocked");
});
