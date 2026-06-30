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

  it("renders context compressor controls from descriptor settings", () => {
    const html = renderToString(<GlobalPluginSettingsForm
      enabled={true}
      maxRisk="green"
      capabilities={["body:write"]}
      actions={[]}
      settings={{
        mode: "transform",
        minSavedTokens: 25,
        minSavedPercent: 10,
        maxBodyBytes: 8388608,
        maxCandidatesPerRequest: 16,
        allowedKinds: ["log", "stacktrace"]
      }}
      availableCapabilities={["body:write"]}
      availableActions={[]}
      settingsSchema={{
        type: "object",
        properties: {
          mode: { type: "enum", values: ["off", "observe", "transform"], default: "transform" },
          minSavedTokens: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
          minSavedPercent: { type: "number", minimum: 0, maximum: 100, default: 0 },
          maxBodyBytes: { type: "integer", minimum: 1024, maximum: 33554432, default: 8388608 },
          maxCandidatesPerRequest: { type: "integer", minimum: 1, maximum: 64, default: 16 },
          allowedKinds: { type: "array", items: { type: "enum", values: ["json", "log", "stacktrace", "shell_output"] }, default: ["json", "log", "stacktrace", "shell_output"] }
        }
      }}
      onSave={() => {}}
    />);
    expect(html).toContain("mode");
    expect(html).toContain("minSavedTokens");
    expect(html).toContain("minSavedPercent");
    expect(html).toContain("maxBodyBytes");
    expect(html).toContain("maxCandidatesPerRequest");
    expect(html).toContain("allowedKinds");
    expect(html).toContain("shell_output");
  });
});
