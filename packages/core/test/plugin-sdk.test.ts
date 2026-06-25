import test from "node:test";
import assert from "node:assert/strict";
import { createLocalPluginRegistry } from "../src/plugins/plugin-sdk.ts";

test("registers local plugins with explicit permissions and rejects remote plugins", () => {
  const registry = createLocalPluginRegistry();
  const permissions = ["body:write"] as const;
  registry.register({ name: "local-compressor", permissions: [...permissions], module: { onRequest: () => ({}) } });
  assert.deepEqual(registry.names(), ["local-compressor"]);
  assert.deepEqual(registry.get("local-compressor")?.permissions, ["body:write"]);
  assert.throws(() => registry.register({ name: "empty", permissions: [], module: { onRequest: () => ({}) } }), /permissions required/);
  assert.throws(() => registry.register({ name: "no-hook", permissions: ["body:write"], module: {} }), /runtime hook required/);
  assert.throws(() => registry.register({ name: "local-compressor", permissions: ["body:write"], module: { onRequest: () => ({}) } }), /duplicate plugin/);
  assert.throws(() => registry.registerRemote("https://example.test/plugin.js"), /remote plugins are disabled/);
});
