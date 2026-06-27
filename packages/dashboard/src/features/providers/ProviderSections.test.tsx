import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderSection } from "./ProviderSections";

describe("ProviderSection", () => {
  it("renders configured providers with weight, team policy, usage, and disabled controls", () => {
    const html = renderToString(<ProviderSection
      testMessages={{ openai: "Test ok for openai" }}
      onNew={() => {}}
      onOptions={() => {}}
      onRemove={() => {}}
      onTest={() => {}}
      onWeight={() => {}}
      teams={[{ id: "everyone", name: "Everyone", allowedProviders: "*" }, { id: "ops", name: "Ops", allowedProviders: ["openai"] }]}
      providers={{ configuredItems: [{ id: "default", name: "Configured default" }, { id: "openai", name: "OpenAI", sharePercent: 75, usage: { requests: 4, inputTokens: 10, outputTokens: 5, costEur: 0.2 } }, { id: "local", name: "Local", enabled: false, sharePercent: 25, usage: { requests: 1 } }] }}
    />);
    expect(html).toContain("OpenAI");
    expect(html).not.toContain("Configured default");
    expect(html).toMatch(/75.*%/);
    expect(html).toMatch(/15.*tokens/);
    expect(html).toContain("Test ok for openai");
    expect(html).toContain("All teams");
    expect(html).toContain("Everyone");
    expect(html).toContain("disabled");
  });
});
