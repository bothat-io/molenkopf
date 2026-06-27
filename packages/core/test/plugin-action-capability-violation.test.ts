import test from "node:test";
import assert from "node:assert/strict";
import { resolveActionPermission } from "../src/plugins/plugin-policy.ts";

test("Action requiring missing capability is blocked", () => {
  const result = resolveActionPermission(
    { requiredCapabilities: ["audit:read:all"], risk: "yellow" },
    { pluginId: "obsidian-graph-plugin", enabled: true, maxRisk: "yellow", capabilities: ["metadata:read"], actions: [], settings: {}, source: { enabled: "global", maxRisk: "global", capabilities: "global", actions: "global", settings: {} }, blockedReasons: [] }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "plugin_capability_violation");
});
