import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginWorkspace } from "./PluginWorkspace";
import { pluginActionLabels } from "./PluginWorkspaceMeta";
import { pluginDefaultMaxRisk } from "./PluginWorkspacePolicy";

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
    expect(html).toContain("plugin-summary-side");
    expect(html).toContain("transformer");
    expect(html).toContain("12 tokens saved");
    expect(html).toContain("Turn on");
  });

  it("uses plugin ids as accordion titles", () => {
    const html = renderToString(<PluginWorkspace
      data={{ usage: {}, keys: { items: [] }, config: {}, providers: {}, summary: {}, plugins: { items: [{ id: "project-graph-plugin", name: "Project Graph", enabled: true, canToggle: true, lifecycleStatus: "booted", type: "observer", category: "storage", traffic: { mutates: ["none"] }, actions: [{ id: "graph.query", label: "Query graph", risk: "green", requiredRole: "member", sideEffects: ["none"] }] }] }, pluginPolicies: { global: { globalPluginPolicy: {} }, teams: {}, effective: {} } }}
      teams={[]}
      onPluginToggle={() => {}}
      onSaveGlobalPluginPolicy={() => {}}
      onSaveTeamPluginPolicy={() => {}}
      onResetTeamPluginPolicy={() => {}}
    />);
    expect(html).toContain("project-graph-plugin");
    expect(html).not.toContain("Query graph");
    expect(html).not.toContain(">Project Graph</");
    expect(pluginActionLabels({
      id: "project-graph-plugin",
      name: "Project Graph",
      actions: [{ id: "graph.query", label: "Query graph", risk: "green", requiredRole: "member", sideEffects: ["none"] }]
    })).toEqual(["graph.query"]);
  });

  it("uses descriptor default risk before falling back to green", () => {
    expect(pluginDefaultMaxRisk({
      id: "project-graph-plugin",
      name: "Project Graph",
      defaultMaxRisk: "orange",
      actions: [{ id: "graph.delete", label: "Delete graph", risk: "orange", requiredRole: "admin", sideEffects: ["storage"] }]
    })).toBe("orange");
    expect(pluginDefaultMaxRisk({ id: "unknown", name: "Unknown", actions: [] })).toBe("green");
  });
});
