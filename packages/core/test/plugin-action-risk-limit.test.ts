import test from "node:test";
import assert from "node:assert/strict";
import { resolveActionPermission } from "../src/plugins/plugin-policy.ts";

test("Action risk above effective policy risk is blocked", () => {
  const result = resolveActionPermission(
    { id: "compress.run", requiredCapabilities: ["metadata:read"], risk: "orange" },
    { pluginId: "context-compressor-plugin", enabled: true, maxRisk: "green", capabilities: ["metadata:read"], actions: ["compress.run"], settings: {}, source: { enabled: "global", maxRisk: "global", capabilities: "global", actions: "global", settings: {} }, blockedReasons: [] }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "plugin_risk_violation");
});
