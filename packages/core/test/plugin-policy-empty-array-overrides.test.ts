import test from "node:test";
import assert from "node:assert/strict";
import { projectGraphDescriptorV2 } from "../src/plugins/builtin-plugin-descriptors-v2.ts";
import { parsePluginPolicyState, resolveEffectivePluginPolicy } from "../src/plugins/plugin-policy.ts";

test("Empty capability and action overrides remain restrictive", () => {
  const global = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: { "project-graph-plugin": { capabilities: [], actions: [] } },
    teamPluginPolicies: []
  }, [projectGraphDescriptorV2]);
  const globalPolicy = resolveEffectivePluginPolicy(projectGraphDescriptorV2, global.state, "team-a");
  assert.deepEqual(globalPolicy.capabilities, []);
  assert.deepEqual(globalPolicy.actions, []);

  const team = parsePluginPolicyState({
    pluginPolicySchemaVersion: 1,
    globalPluginPolicy: {},
    teamPluginPolicies: [{ teamId: "team-a", pluginId: "project-graph-plugin", overrides: { capabilities: [], actions: [] } }]
  }, [projectGraphDescriptorV2]);
  const teamPolicy = resolveEffectivePluginPolicy(projectGraphDescriptorV2, team.state, "team-a");
  assert.deepEqual(teamPolicy.capabilities, []);
  assert.deepEqual(teamPolicy.actions, []);
});
