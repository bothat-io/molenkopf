import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EffectivePluginPolicyView } from "./EffectivePluginPolicyView";

describe("EffectivePluginPolicyView", () => {
  it("renders effective plugin policy rows", () => {
    const html = renderToString(<EffectivePluginPolicyView
      effective={{ teamId: "alpha", policies: { "token-optimizer-plugin": { pluginId: "token-optimizer-plugin", globalOverrideExists: false, teamOverrideExists: false, policy: { enabled: true, maxRisk: "green", capabilities: ["policy:recommend"], actions: [], settings: {}, source: { enabled: "global", maxRisk: "global", capabilities: "global", actions: "global", settings: {} }, blockedReasons: [] } } } }}
    />);
    expect(html).toContain("Effective Plugin Policy");
    expect(html).toContain("token-optimizer-plugin");
    expect(html).toContain("Capabilities:");
    expect(html).toContain("policy:recommend");
  });
});
