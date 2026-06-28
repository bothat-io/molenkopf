import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlobalPluginSettingsForm, TeamPluginSettingsForm } from "./PluginSettingsForm";

describe("PluginSettingsForm", () => {
  it("renders global save controls", () => {
    const html = renderToString(<GlobalPluginSettingsForm enabled={true} maxRisk="yellow" onSave={() => {}} />);
    expect(html).toContain("Save global defaults");
    expect(html).toContain("yellow");
  });

  it("disables team override values while inherit mode is active", () => {
    const html = renderToString(<TeamPluginSettingsForm
      draft={{ enabledMode: "inherit", enabled: true, maxRiskMode: "inherit", maxRisk: "green" }}
      onSave={() => {}}
      onReset={() => {}}
    />);
    expect(html).toContain("Save team overrides");
    expect(html).toContain("Reset team overrides");
    expect(html).toContain("disabled=\"\"");
  });
});
