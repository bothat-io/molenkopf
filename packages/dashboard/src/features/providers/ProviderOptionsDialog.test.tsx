import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderOptionsDialog, providerOptionsBody } from "./ProviderOptionsDialog";

describe("ProviderOptionsDialog", () => {
  it("does not expose project policy fields in the primary provider flow", () => {
    const html = renderToString(<ProviderOptionsDialog close={() => {}} reload={() => {}} provider={{ id: "openai", name: "OpenAI", target: "https://api.openai.com/v1" }} />);

    expect(html).toContain("Provider options");
    expect(html).not.toContain("Project allowlist");
    expect(html).not.toContain("Project blocklist");
  });

  it("preserves explicit distribution checkbox defaults", () => {
    const disabled = renderToString(<ProviderOptionsDialog close={() => {}} reload={() => {}} provider={{ id: "openai", name: "OpenAI", kind: "api", target: "https://api.openai.com/v1", allowDistribution: false }} />);
    const enabled = renderToString(<ProviderOptionsDialog close={() => {}} reload={() => {}} provider={{ id: "openai", name: "OpenAI", kind: "api", target: "https://api.openai.com/v1", allowDistribution: true }} />);
    const unset = renderToString(<ProviderOptionsDialog close={() => {}} reload={() => {}} provider={{ id: "openai", name: "OpenAI", kind: "api", target: "https://api.openai.com/v1" }} />);

    expect(disabled).not.toContain('name="distribution" checked=""');
    expect(enabled).toContain('name="distribution" checked=""');
    expect(unset).toContain('name="distribution" checked=""');
  });

  it("serializes intentional distribution edits", () => {
    const checked = new FormData();
    checked.set("name", "OpenAI");
    checked.set("enabled", "true");
    checked.set("target", "https://api.openai.com/v1");
    checked.set("distribution", "on");
    expect(providerOptionsBody({ id: "openai", kind: "api" }, checked).allowDistribution).toBe(true);

    const unchecked = new FormData();
    unchecked.set("name", "OpenAI");
    unchecked.set("enabled", "true");
    unchecked.set("target", "https://api.openai.com/v1");
    expect(providerOptionsBody({ id: "openai", kind: "api" }, unchecked).allowDistribution).toBe(false);
  });
});
