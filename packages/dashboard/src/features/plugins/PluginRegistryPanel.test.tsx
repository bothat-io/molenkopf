import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginRegistryPanel } from "./PluginRegistryPanel";

describe("PluginRegistryPanel", () => {
  it("renders global plugin registry entries from plugin state and global policy", () => {
    const html = renderToString(<PluginRegistryPanel
      plugins={{ items: [{ id: "token-optimizer-plugin", name: "Token Optimizer", description: "observe only", permissions: ["policy:recommend"], enabled: true }] }}
      globalPolicy={{ globalPluginPolicy: { "token-optimizer-plugin": { enabled: true, maxRisk: "green" } } }}
    />);
    expect(html).toContain("Global Plugin Registry");
    expect(html).toContain("Token Optimizer");
    expect(html).toContain("Global max risk:");
    expect(html).toContain("green");
  });
});
