import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginPolicyState, resolveEffectivePluginPolicy, type ResolvedPluginPolicy } from "../src/plugins/plugin-policy.ts";
import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const descriptor: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "obsidian-graph-plugin",
  name: "Obsidian Graph",
  category: "visualization",
  risk: "green",
  capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
  settingsSchema: {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
      keep: { type: "integer", minimum: 1, maximum: 10, default: 5, restrictiveMerge: "minWins" },
      labels: { type: "array", items: { type: "string" }, default: ["a"], restrictiveMerge: "intersection" }
    }
  },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "green",
    capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
    settings: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: true },
        keep: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        labels: { type: "array", items: { type: "string" }, default: ["a"] }
      }
    },
    actions: []
  },
  modulePath: "plugin.ts"
};

function sourcePolicy(): ResolvedPluginPolicy {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "obsidian-graph-plugin": {
        enabled: false,
        settings: { keep: 8, labels: ["a", "b"] }
      }
    },
    teamPluginPolicies: [
      { teamId: "team-a", pluginId: "obsidian-graph-plugin", overrides: { settings: { keep: 6 } } }
  ]}, [descriptor]);
  return resolveEffectivePluginPolicy(descriptor, state.state, "team-a");
}

test("Policy source tracks effective value lineage per field", () => {
  const policy = sourcePolicy();
  assert.equal(policy.source.enabled, "global");
  assert.equal(policy.source.maxRisk, "global");
  assert.equal(policy.source.capabilities, "global");
  assert.equal(policy.source.actions, "global");
  assert.equal(policy.source.settings["enabled"], "blocked");
  assert.equal(policy.source.settings["keep"], "team");
  assert.equal(policy.source.settings["labels"], "global");
});
