import { describe, expect, it } from "vitest";
import { buildGlobalPluginPolicyRequest, buildResetTeamPluginPolicyRequest, buildTeamPluginPolicyRequest } from "./pluginPolicyMutations";

const data = {
  usage: {},
  keys: { items: [] },
  config: {},
  providers: {},
  summary: {},
  plugins: {},
  pluginPolicies: {
    global: { globalPluginPolicy: { alpha: { enabled: true, maxRisk: "yellow" } } },
    teams: { teamA: { teamId: "teamA", pluginPolicies: { alpha: { enabled: false } } } }
  }
};

describe("pluginPolicyMutations", () => {
  it("builds global updates by preserving existing plugin fields", () => {
    expect(buildGlobalPluginPolicyRequest(data as any, "alpha", { enabled: false, maxRisk: "green" })).toEqual({
      path: "/__molenkopf/plugin-policies/global",
      body: { globalPluginPolicy: { alpha: { enabled: false, maxRisk: "green" } } }
    });
  });

  it("stores only explicit team overrides and can reset them", () => {
    expect(buildTeamPluginPolicyRequest(data as any, "teamA", "alpha", { enabledMode: "inherit", enabled: true, maxRiskMode: "override", maxRisk: "green" })).toEqual({
      path: "/__molenkopf/plugin-policies/teams/teamA",
      body: { pluginPolicies: { alpha: { maxRisk: "green" } } }
    });
    expect(buildResetTeamPluginPolicyRequest(data as any, "teamA", "alpha")).toEqual({
      path: "/__molenkopf/plugin-policies/teams/teamA",
      body: { pluginPolicies: {} }
    });
  });
});
