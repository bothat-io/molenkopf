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
  capabilities: ["metadata:read", "settings:read", "settings:write"],
  settingsSchema: {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 80, restrictiveMerge: "minWins" },
      tags: { type: "array", items: { type: "string" }, default: ["logs"], restrictiveMerge: "intersection" }
    }
  },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "yellow",
    capabilities: ["metadata:read", "settings:read", "settings:write"],
    settings: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 80 },
        tags: { type: "array", items: { type: "string" }, default: ["logs"] }
      }
    },
    actions: []
  },
  modulePath: "plugin.ts"
};

test("Team may override one setting while inheriting remaining settings", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "context-compressor-plugin": {
        settings: { enabled: false, limit: 30, tags: ["logs", "events"] }
      }
    },
    teamPluginPolicies: [
      { teamId: "team-a", pluginId: "context-compressor-plugin", overrides: { settings: { limit: 20 } } }
    ]
  }, [descriptor]);
  const effective = resolveEffectivePluginPolicy(descriptor, state.state, "team-a");
  assert.equal(effective.settings.enabled, false);
  assert.equal(effective.settings.limit, 20);
  assert.deepEqual(effective.settings.tags, ["logs", "events"]);
});
