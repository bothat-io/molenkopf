import { num } from "../../app/format";
import type { PluginView } from "../../app/types";

export function PluginInfoCard({ title, value, note }: { title: string; value: string; note: string }) {
  return <div className="plugin-kv"><b>{title}</b><span>{value}</span><small>{note}</small></div>;
}

export function PluginWorkspaceSummary({ plugin, actions }: { plugin: PluginView; actions: string[] }) {
  return <div className="plugin-panel-block">
    <div className="plugin-panel-heading">
      <h4>Workspace surface</h4>
      <p>What this plugin exposes beyond global policy toggles.</p>
    </div>
    <div className="plugin-tag-list">
      <span className={`plugin-tag${plugin.pagePath ? " soft" : ""}`}>{plugin.pagePath ? "Page available" : "No page"}</span>
      <span className={`plugin-tag${plugin.dataPath ? " soft" : ""}`}>{plugin.dataPath ? "Data endpoint" : "No data endpoint"}</span>
      <span className={`plugin-tag${actions.length ? " soft" : ""}`}>{actions.length ? `${actions.length} actions` : "No actions"}</span>
      {plugin.dataScopes?.map((item) => <span key={item} className="plugin-tag">{item}</span>)}
    </div>
  </div>;
}

export function pluginActionLabels(plugin: PluginView): string[] {
  return plugin.actions?.map((action) => action.label || action.id).filter(Boolean) || [];
}

export function isSafePluginPagePath(path: string | undefined): path is string {
  return typeof path === "string" && /^\/__molenkopf\/plugins\/[a-z0-9-]+\/page$/.test(path);
}

export function pluginEffect(plugin: PluginView): string {
  const effects = plugin.traffic?.mutates?.filter((item) => item && item !== "none") || [];
  return effects.length ? effects.join(", ") : "observe";
}

export function pluginMetric(id: string, savedTokens: number | undefined, category: string | undefined): string {
  if (id === "context-compressor-plugin") return `${num(savedTokens)} tokens saved`;
  if (id === "obsidian-graph-plugin") return "memory graph";
  if (id === "token-optimizer-plugin") return "recommendations";
  return category || "none";
}
