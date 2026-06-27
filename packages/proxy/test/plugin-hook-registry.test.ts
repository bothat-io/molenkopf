import test from "node:test";
import assert from "node:assert/strict";
import { hookDefinition, pluginHookRegistry } from "../src/http/plugin-hook-registry.ts";

test("hook registry defines the MVP hook phases and capability matrix", () => {
  assert.equal(pluginHookRegistry.length, 6);
  assert.deepEqual(pluginHookRegistry.map((item) => item.phase), [
    "onRequestMetadata",
    "onRequestBody",
    "onAudit",
    "onEvent",
    "getData",
    "action"
  ]);

  const body = hookDefinition("onRequestBody");
  assert.ok(body);
  assert.equal(body?.allowsMutation, true);
  assert.deepEqual(body?.requiredCapabilities, ["body:redacted:read", "body:write"]);

  const event = hookDefinition("onEvent");
  assert.ok(event);
  assert.equal(event?.allowsMutation, false);
  assert.deepEqual(event?.requiredCapabilities, ["events:write"]);
});
