import test from "node:test";
import assert from "node:assert/strict";
import { pluginDescriptorVersion, type PluginDescriptorV2, validatePluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

const contextCompressorActionFixture = {
  id: "previewCompression",
  label: "Preview compression",
  description: "Dry-run request compression.",
  requiredCapabilities: ["policy:recommend"],
  requiredRole: "admin",
  risk: "yellow",
  inputSchema: { type: "object", properties: {} },
  outputSchema: { type: "object", properties: {} },
  confirmation: "required",
  sideEffects: ["none"],
  auditEvent: true,
  outputSafety: "strict"
} satisfies PluginDescriptorV2["actions"][number];

const contextCompressorV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "context-compressor-plugin",
  name: "Context Compressor",
  category: "compression",
  risk: "orange",
  capabilities: ["body:redacted:read", "body:write", "audit:read:scoped", "audit:write", "settings:read"],
  settingsSchema: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
  actions: [contextCompressorActionFixture],
  defaultPolicy: {
    enabled: true,
    maxRisk: "yellow",
    capabilities: ["body:redacted:read", "audit:read:scoped", "audit:write", "settings:read"],
    settings: { type: "object", properties: {} },
    actions: ["previewCompression"]
  },
  workspace: { pagePath: "/__molenkopf/plugins/context-compressor-plugin/page", dataPath: "/__molenkopf/plugins/context-compressor-plugin/data" },
  dataScopes: ["metrics", "audit-summary"],
  modulePath: "plugin.ts"
};

const observerV2: PluginDescriptorV2 = {
  descriptorVersion: pluginDescriptorVersion,
  id: "sample-observer-plugin",
  name: "Sample Observer",
  category: "visualization",
  risk: "green",
  capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
  settingsSchema: { type: "object", properties: { enabled: { type: "boolean", default: true } } },
  actions: [],
  defaultPolicy: {
    enabled: true,
    maxRisk: "green",
    capabilities: ["metadata:read", "audit:read:scoped", "settings:read"],
    settings: { type: "object", properties: {} },
    actions: []
  },
  workspace: { pagePath: "/__molenkopf/plugins/sample-observer-plugin/page", dataPath: "/__molenkopf/plugins/sample-observer-plugin/data" },
  dataScopes: ["metrics"],
  modulePath: "plugin.ts"
};

test("v2 descriptors pass the contract validator", () => {
  assert.equal(validatePluginDescriptorV2(contextCompressorV2).ok, true);
  assert.equal(validatePluginDescriptorV2(observerV2).ok, true);
});

test("action outputSafety only accepts strict/adminSafe", () => {
  const invalid = { ...contextCompressorActionFixture, outputSafety: "none" } as unknown;
  const broken = { ...contextCompressorV2, actions: [invalid] };
  const result = validatePluginDescriptorV2(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("action:outputSafety-invalid"));
});

test("action none side-effect cannot be combined", () => {
  const invalid = { ...contextCompressorActionFixture, sideEffects: ["none", "storage"] } as unknown;
  const broken = { ...contextCompressorV2, actions: [invalid] };
  const result = validatePluginDescriptorV2(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("action:sideEffect-none-combination"));
});
