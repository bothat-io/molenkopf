import test from "node:test";
import assert from "node:assert/strict";
import { resolvePluginActionRole } from "../../core/src/plugins/plugin-policy.ts";

test("manager-only actions are forbidden in MVP unless explicitly enabled later", () => {
  const action = { requiredRole: "manager" as const };
  assert.equal(resolvePluginActionRole(action, "manager"), false);
  assert.equal(resolvePluginActionRole(action, "admin"), true);
  assert.equal(resolvePluginActionRole(action, "manager", true), true);
});
