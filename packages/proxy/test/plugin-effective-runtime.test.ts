import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeState, resolveEffectivePluginPolicy, resolveRequestPluginIds } from "../src/http/runtime-state.ts";
import { pluginPolicySchemaVersion, resolveTeamPolicies } from "../../core/src/plugins/plugin-policy.ts";
import { builtinPluginDescriptorV2 } from "../src/http/plugin-platform.ts";

test("resolveRequestPluginIds is policy-driven with team overrides", async () => {
  const state = {
    pluginEnabled: { "context-compressor-plugin": true, "token-optimizer-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {
        "context-compressor-plugin": { enabled: false },
        "token-optimizer-plugin": { enabled: true }
      },
      teamPluginPolicies: []
    }
  } as any;

  const ids = resolveRequestPluginIds(state, ["team-a"]);
  assert.ok(!ids.includes("context-compressor-plugin"));
  assert.ok(ids.includes("token-optimizer-plugin"));
});

test("request-time policy ignores legacy pluginEnabled flags when global policy is absent", () => {
  const state = {
    pluginEnabled: { "token-optimizer-plugin": false },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {},
      teamPluginPolicies: []
    }
  } as any;

  const ids = resolveRequestPluginIds(state, ["team-a"]);
  assert.ok(ids.includes("token-optimizer-plugin"));
  assert.ok(!ids.includes("context-compressor-plugin"));
});

test("request body hooks require body capabilities", () => {
  const state = {
    pluginEnabled: { "context-compressor-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {
        "context-compressor-plugin": { enabled: true, capabilities: ["body:redacted:read"] }
      },
      teamPluginPolicies: []
    }
  } as any;

  const ids = resolveRequestPluginIds(state, ["team-a"]);
  assert.ok(!ids.includes("context-compressor-plugin"));
  assert.ok(ids.includes("token-optimizer-plugin"));
});

test("request plugin selection applies agent allowlists", () => {
  const state = {
    pluginEnabled: { "context-compressor-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: { "context-compressor-plugin": { enabled: true } },
      teamPluginPolicies: []
    }
  } as any;

  assert.deepEqual(resolveRequestPluginIds(state, ["team-a"], []), []);
  assert.deepEqual(resolveRequestPluginIds(state, ["team-a"], ["context-compressor-plugin"]), ["context-compressor-plugin"]);
});

test("legacy pluginEnabled settings seed request policy at startup", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-policy-legacy-"));
  try {
    await writeFile(join(dataDir, "runtime-settings.json"), JSON.stringify({ pluginEnabled: { "token-optimizer-plugin": false } }), "utf8");
    const state = createRuntimeState({ target: "http://127.0.0.1:1/v1", dataDir }, "127.0.0.1");
    const policy = resolveEffectivePluginPolicy(state, "token-optimizer-plugin", ["team-a"]);
    assert.equal(policy?.enabled, false);
    assert.ok(!resolveRequestPluginIds(state, ["team-a"]).includes("token-optimizer-plugin"));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
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
