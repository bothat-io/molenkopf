import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginWorkspace } from "./PluginWorkspace";

describe("PluginWorkspace", () => {
  it("renders one generic plugin surface with scope selection and plugin accordions", () => {
    const html = renderToString(<PluginWorkspace
      data={{ usage: {}, keys: { items: [] }, config: {}, providers: {}, summary: { savedTokens: 12 }, plugins: { items: [{ id: "context-compressor-plugin", name: "context-compressor-plugin", enabled: false, canToggle: true, lifecycleStatus: "booted", type: "transformer", category: "compression", traffic: { mutates: ["transform"] } }] }, pluginPolicies: { global: { globalPluginPolicy: { "context-compressor-plugin": { enabled: false, maxRisk: "green" } } }, teams: {}, effective: {} } }}
      teams={[{ id: "everyone", name: "Everyone" }]}
      onPluginToggle={() => {}}
      onSaveGlobalPluginPolicy={() => {}}
      onSaveTeamPluginPolicy={() => {}}
      onResetTeamPluginPolicy={() => {}}
    />);
    expect(html).toContain("Plugins");
    expect(html).toContain("Global default");
    expect(html).toContain("Everyone");
    expect(html).toContain("context-compressor-plugin");
    expect(html).toContain("transformer");
    expect(html).toContain("12 tokens saved");
    expect(html).toContain("Turn on");
  });
});
