import test from "node:test";
import assert from "node:assert/strict";
import { resolveActionPermission } from "../src/plugins/plugin-policy.ts";

test("Action omitted from effective policy actions is blocked", () => {
  const result = resolveActionPermission(
    { id: "graph.delete", requiredCapabilities: ["project:graph:write", "action:execute"], risk: "orange" },
    {
      pluginId: "project-graph-plugin",
      enabled: true,
      maxRisk: "orange",
      capabilities: ["project:graph:write", "action:execute"],
      actions: ["graph.query"],
      settings: {},
      source: { enabled: "global", maxRisk: "global", capabilities: "global", actions: "global", settings: {} },
      blockedReasons: []
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "plugin_action_forbidden");
});
