import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeState, enabledPluginIds, isPluginEnabled, resolveEffectivePluginPolicy, resolveRequestPluginIds } from "../src/http/runtime-state.ts";
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

test("request policy ignores default everyone when specific teams are present", () => {
  const state = {
    pluginEnabled: { "token-optimizer-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: { "token-optimizer-plugin": { enabled: true } },
      teamPluginPolicies: [{
        teamId: "alpha",
        pluginId: "token-optimizer-plugin",
        overrides: { enabled: false }
      }]
    }
  } as any;

  const policy = resolveEffectivePluginPolicy(state, "token-optimizer-plugin", ["everyone", "alpha"]);
  assert.equal(policy?.enabled, false);
  assert.ok(!resolveRequestPluginIds(state, ["everyone", "alpha"]).includes("token-optimizer-plugin"));
});

test("multiple specific team policies merge restrictively", () => {
  const state = {
    pluginEnabled: { "project-graph-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: { "project-graph-plugin": { enabled: true, maxRisk: "orange" } },
      teamPluginPolicies: [
        { teamId: "alpha", pluginId: "project-graph-plugin", overrides: { enabled: true, maxRisk: "orange" } },
        { teamId: "beta", pluginId: "project-graph-plugin", overrides: { enabled: false, maxRisk: "green", actions: [] } }
      ]
    }
  } as any;

  const policy = resolveEffectivePluginPolicy(state, "project-graph-plugin", ["alpha", "beta"]);
  assert.equal(policy?.enabled, false);
  assert.equal(policy?.maxRisk, "green");
  assert.deepEqual(policy?.actions, []);
});

test("multiple specific team plugin settings merge restrictively regardless of order", () => {
  const state = {
    pluginEnabled: { "context-compressor-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: {
        "context-compressor-plugin": {
          enabled: true,
          settings: {
            mode: "transform",
            maxBodyBytes: 16384,
            minSavedTokens: 0,
            allowedKinds: ["json", "log", "stacktrace"]
          }
        }
      },
      teamPluginPolicies: [
        {
          teamId: "alpha",
          pluginId: "context-compressor-plugin",
          overrides: { settings: { mode: "transform", maxBodyBytes: 4096, minSavedTokens: 100, allowedKinds: ["json", "log"] } }
        },
        {
          teamId: "beta",
          pluginId: "context-compressor-plugin",
          overrides: { settings: { mode: "observe", maxBodyBytes: 8192, minSavedTokens: 50, allowedKinds: ["json", "stacktrace"] } }
        }
      ]
    }
  } as any;

  const forward = resolveEffectivePluginPolicy(state, "context-compressor-plugin", ["alpha", "beta"]);
  const reverse = resolveEffectivePluginPolicy(state, "context-compressor-plugin", ["beta", "alpha"]);
  assert.equal(forward?.settings.mode, "observe");
  assert.equal(forward?.settings.maxBodyBytes, 4096);
  assert.equal(forward?.settings.minSavedTokens, 100);
  assert.deepEqual(forward?.settings.allowedKinds, ["json"]);
  assert.deepEqual(reverse?.settings, forward?.settings);
});

test("global plugin status helpers follow policy state", () => {
  const state = {
    pluginEnabled: { "token-optimizer-plugin": true },
    pluginPolicyState: {
      pluginPolicySchemaVersion,
      globalPluginPolicy: { "token-optimizer-plugin": { enabled: false } },
      teamPluginPolicies: []
    }
  } as any;

  assert.equal(isPluginEnabled(state, "token-optimizer-plugin"), false);
  assert.ok(!enabledPluginIds(state).includes("token-optimizer-plugin"));
});
