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
  settingsSchema: {
    type: "object",
    properties: {
      useNewAlgo: { type: "boolean", default: false, restrictiveMerge: "falseWins" },
      keep: { type: "integer", minimum: 1, maximum: 120, default: 70, restrictiveMerge: "minWins" },
      sampleRate: { type: "number", minimum: 0.1, maximum: 1, default: 0.5, restrictiveMerge: "maxWins" },
      tags: { type: "array", items: { type: "string" }, default: ["logs", "json"], restrictiveMerge: "intersection" },
      mode: { type: "enum", values: ["off", "light", "heavy"], default: "light", restrictiveMerge: "orderedMax" }
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
        useNewAlgo: { type: "boolean", default: false },
        keep: { type: "integer", minimum: 1, maximum: 120, default: 70 },
        sampleRate: { type: "number", minimum: 0.1, maximum: 1, default: 0.5 },
        tags: { type: "array", items: { type: "string" }, default: ["logs", "json"] },
        mode: { type: "enum", values: ["off", "light", "heavy"], default: "light" }
      }
    },
    actions: []
  },
  modulePath: "plugin.ts"
};

test("Restrictive merge strategies produce expected per-setting outcomes", () => {
  const state = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {
      "sample-observer-plugin": {
        settings: {
          useNewAlgo: true,
          keep: 50,
          sampleRate: 0.2,
          tags: ["logs", "json", "stacktrace"],
          mode: "heavy"
        }
      }
    },
    teamPluginPolicies: [
      {
        teamId: "team-a",
        pluginId: "sample-observer-plugin",
        overrides: {
          settings: {
            useNewAlgo: false,
            keep: 20,
            sampleRate: 0.8,
            tags: ["logs", "json", "secret"],
            mode: "light"
          }
        }
      }
    ]
  }, [descriptor]);

  const policy = resolveEffectivePluginPolicy(descriptor, state.state, "team-a");
  assert.equal(policy.settings.useNewAlgo, false, "falseWins should allow team false override");
  assert.equal(policy.settings.keep, 20);
  assert.equal(policy.settings.sampleRate, 0.8);
  assert.deepEqual(policy.settings.tags, ["logs", "json"]);
  assert.equal(policy.settings.mode, "light");
});
