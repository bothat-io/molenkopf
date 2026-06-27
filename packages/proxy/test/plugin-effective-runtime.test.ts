import test from "node:test";
import assert from "node:assert/strict";
import { resolveRequestPluginIds } from "../src/http/runtime-state.ts";
import { pluginPolicySchemaVersion, resolveTeamPolicies } from "../../core/src/plugins/plugin-policy.ts";
import { builtinPluginDescriptorV2 } from "../src/http/plugin-platform.ts";

test("resolveRequestPluginIds is policy-driven with team overrides", async () => {
  const descriptors = builtinPluginDescriptorV2();
  const state = {
    pluginEnabled: { "context-compressor-plugin": true, "obsidian-graph-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {
        "context-compressor-plugin": { enabled: false },
        "obsidian-graph-plugin": { enabled: true }
      },
      teamPluginPolicies: []
    }
  } as any;

  const ids = resolveRequestPluginIds(state, ["team-a"]);
  assert.ok(!ids.includes("context-compressor-plugin"));
  assert.ok(ids.includes("obsidian-graph-plugin"));
});

test("request-time policy ignores legacy pluginEnabled flags when global policy is absent", () => {
  const descriptors = builtinPluginDescriptorV2();
  const state = {
    pluginEnabled: { "obsidian-graph-plugin": false },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {},
      teamPluginPolicies: []
    }
  } as any;

  const ids = resolveRequestPluginIds(state, ["team-a"]);
  assert.ok(ids.includes("obsidian-graph-plugin"));
  assert.ok(!ids.includes("context-compressor-plugin"));
});

test("team override cannot enable globally disabled plugin", () => {
  const descriptors = builtinPluginDescriptorV2();
  const teamPolicy = {
    pluginPolicySchemaVersion,
    globalPluginPolicy: {
      "context-compressor-plugin": { enabled: false }
    },
    teamPluginPolicies: [{
      teamId: "team-a",
      pluginId: "context-compressor-plugin",
      overrides: { enabled: true }
    }],
    lastValidatedAt: new Date().toISOString()
  };
  const contextPolicy = resolveTeamPolicies(teamPolicy, descriptors, "team-a").get("context-compressor-plugin");
  assert.ok(contextPolicy);
  assert.equal(contextPolicy?.enabled, false);
});
