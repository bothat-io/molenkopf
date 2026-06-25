import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginSections, ProviderSection } from "./ProviderSections";

describe("PluginSections", () => {
  it("renders optional plugins with capabilities and toggle actions", () => {
    const html = renderToString(<PluginSections
      summary={{ savedTokens: 0, redactedSecrets: 2 }}
      onMove={() => {}}
      onToggle={() => {}}
      plugins={{
        items: [
          { id: "context-compressor-plugin", name: "context-compressor-plugin", type: "transformer", category: "compression", enabled: false, canToggle: true, lifecycleStatus: "disabled", pipelineIndex: 0, order: 0, pagePath: "/__molenkopf/plugins/context-compressor-plugin/page", dataScopes: ["metrics"], traffic: { mutates: ["transform"] } },
          { id: "obsidian-graph-plugin", name: "obsidian-graph-plugin", type: "observer", category: "visualization", enabled: true, canToggle: true, lifecycleStatus: "enabled", pagePath: "/__molenkopf/plugins/obsidian-graph-plugin/page", dataScopes: ["metrics"], traffic: { mutates: ["none"] } }
        ]
      }}
    />);

    expect(html).not.toContain("Redaction runs after compression");
    expect(html).not.toContain("locked");
    expect(html).toContain("Effect");
    expect(html).toContain("transform");
    expect(html).toContain("Open plugin page");
    expect(html).toContain("Turn on");
    expect(html).toContain("Turn off");
  });
});

describe("ProviderSection", () => {
  it("renders configured providers with weight, policy, usage, and disabled controls", () => {
    const html = renderToString(<ProviderSection
      testMessages={{ openai: "Test ok for openai" }}
      onNew={() => {}}
      onOptions={() => {}}
      onRemove={() => {}}
      onTest={() => {}}
      onWeight={() => {}}
      teams={[{ id: "everyone", name: "Everyone", allowedProviders: "*" }, { id: "ops", name: "Ops", allowedProviders: ["openai"] }]}
      providers={{
        configuredItems: [
          { id: "default", name: "Configured default" },
          { id: "openai", name: "OpenAI", sharePercent: 75, usage: { requests: 4, inputTokens: 10, outputTokens: 5, costEur: 0.2 } },
          { id: "local", name: "Local", enabled: false, sharePercent: 25, usage: { requests: 1 } }
        ]
      }}
    />);

    expect(html).toContain("OpenAI");
    expect(html).not.toContain("Configured default");
    expect(html).toMatch(/75.*%/);
    expect(html).not.toContain(">100%</button>");
    expect(html).toMatch(/15.*tokens/);
    expect(html).toContain("Test ok for openai");
    expect(html).toContain("Teams");
    expect(html).not.toContain("Projects");
    expect(html).toContain("All teams");
    expect(html).toContain("Everyone");
    expect(html).toContain("disabled");
  });
});
