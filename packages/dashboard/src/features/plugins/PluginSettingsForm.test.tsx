import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlobalPluginSettingsForm, TeamPluginSettingsForm } from "./PluginSettingsForm";

describe("PluginSettingsForm", () => {
  it("renders global save controls", () => {
    const html = renderToString(<GlobalPluginSettingsForm
      enabled={true}
      maxRisk="yellow"
      capabilities={["body:write"]}
      actions={["compress.observe"]}
      settings={{ mode: "observe" }}
      availableCapabilities={["body:write", "audit:read:scoped"]}
      availableActions={["compress.observe"]}
      settingsSchema={{ type: "object", properties: { mode: { type: "enum", values: ["off", "observe"], default: "off" } } }}
      onSave={() => {}}
    />);
    expect(html).toContain("Save global defaults");
    expect(html).toContain("yellow");
    expect(html).toContain("Allowed capabilities");
    expect(html).toContain("compress.observe");
    expect(html).toContain("mode");
  });

  it("disables team override values while inherit mode is active", () => {
    const html = renderToString(<TeamPluginSettingsForm
      draft={{
        enabledMode: "inherit",
        enabled: true,
        maxRiskMode: "inherit",
        maxRisk: "green",
        capabilitiesMode: "inherit",
        capabilities: ["body:write"],
        actionsMode: "inherit",
        actions: ["compress.observe"],
        settingsMode: "inherit",
        settings: { enabled: true }
      }}
      availableCapabilities={["body:write"]}
      availableActions={["compress.observe"]}
      settingsSchema={{ type: "object", properties: { enabled: { type: "boolean", default: true } } }}
      onSave={() => {}}
      onReset={() => {}}
    />);
    expect(html).toContain("Save team overrides");
    expect(html).toContain("Reset team overrides");
    expect(html).toContain("disabled=\"\"");
  });
});
