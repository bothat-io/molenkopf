import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamPluginSettings } from "./TeamPluginSettings";

describe("TeamPluginSettings", () => {
  it("shows inherited versus overridden team plugin state", () => {
    const html = renderToString(<TeamPluginSettings
      team={{ id: "alpha", name: "Alpha" }}
      plugins={{ items: [{ id: "obsidian-graph-plugin", name: "Obsidian Graph" }] }}
      teamPolicy={{ teamId: "alpha", pluginPolicies: { "obsidian-graph-plugin": { enabled: false } } }}
      effectivePolicy={{ teamId: "alpha", policies: { "obsidian-graph-plugin": { pluginId: "obsidian-graph-plugin", globalOverrideExists: true, teamOverrideExists: true, policy: { enabled: false, maxRisk: "green", capabilities: [], actions: [], settings: {}, source: { enabled: "team", maxRisk: "global", capabilities: "global", actions: "global", settings: {} }, blockedReasons: [] } } } }}
    />);
    expect(html).toContain("Selected team: Alpha");
    expect(html).toContain("Enabled mode:");
    expect(html).toContain("override");
    expect(html).toContain("Overridden by team");
  });
});
