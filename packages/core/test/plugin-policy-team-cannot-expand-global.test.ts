import test from "node:test";
import assert from "node:assert/strict";
import { parsePluginPolicyState, resolveEffectivePluginPolicy } from "../src/plugins/plugin-policy.ts";
import { pluginDescriptorVersion, type PluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const descriptor: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "Context Compressor",
  category: "compression",
  risk: "orange",
  capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
  settingsSchema: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "yellow",
    capabilities: ["metadata:read"],
    settings: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
    actions: []
  },
  modulePath: "plugin.ts"
};

test("Team overrides cannot expand global capabilities or enable a disabled plugin", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "context-compressor-plugin": { enabled: false, maxRisk: "green", capabilities: ["metadata:read"] }
    },
    teamPluginPolicies: [
      {
        teamId: "team-a",
        pluginId: "context-compressor-plugin",
        overrides: { enabled: true, maxRisk: "red", capabilities: ["metadata:read", "audit:read:scoped"] }
      }
    ]
  }, [descriptor]);

  const effective = resolveEffectivePluginPolicy(descriptor, state.state, "team-a");
  assert.equal(effective.enabled, false);
  assert.equal(effective.maxRisk, "green");
  assert.deepEqual(effective.capabilities, ["metadata:read"]);
  assert.ok(effective.blockedReasons.includes("team_disabled"));
  assert.ok(effective.blockedReasons.includes("team_risk_exceeds_global"));
  assert.ok(effective.blockedReasons.includes("team_capabilities_exceeds_global"));
});
