import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../components/actions/IconButton";
import { ActionGroup } from "../../components/actions/ActionGroup";
import { DataTable } from "../../components/data/DataTable";
import { num, eur, tokensOf } from "../../app/format";
import { SectionTitle } from "../../components/layout/DashboardSection";
import type { PluginState, PluginView, ProviderState, ProviderView, SummaryView, TeamView } from "../../app/types";
import "./ProviderSections.css";

export function ProviderSection({ providers, teams, testMessages, onNew, onWeight, onRemove, onOptions, onTest }: { providers: ProviderState; teams: TeamView[]; testMessages: Record<string, string>; onNew: () => void; onWeight: (id: string, share: number) => void | Promise<void>; onRemove: (id: string) => void; onOptions: (id: string) => void; onTest: (id: string) => void }) {
  const items = configuredProviders(providers);
  const tokenTotal = items.reduce((sum, item) => sum + tokensOf(item.usage), 0);
  const reqTotal = items.reduce((sum, item) => sum + Number(item.usage?.requests || 0), 0);
  return <section><SectionTitle label="Providers"><button className="ghost" onClick={onNew}>+ New provider</button></SectionTitle><DataTable className="provider-table" rows={items} rowKey={(p) => p.id} empty={<div className="empty">No provider configured. Add an API provider or import a Claude/Codex runtime profile.</div>} columns={[
    { key: "provider", header: "Provider", width: "28%", cell: (p) => <><div className="name">{p.name || p.id} {p.enabled === false ? <span className="pill off">disabled</span> : null}</div><div className="rs">{p.id}{testMessages[p.id] ? ` - ${testMessages[p.id]}` : ""}</div></> },
    { key: "weight", header: "Weight", width: "22%", className: "num", cell: (p) => <ProviderWeight provider={p} onWeight={onWeight} /> },
    { key: "usage", header: "Usage", width: "20%", cell: (p) => <ProviderUsage provider={p} tokenTotal={tokenTotal} reqTotal={reqTotal} /> },
    { key: "teams", header: "Teams", cell: (p) => teamPolicy(p, teams) },
    { key: "actions", header: "Actions", width: "132px", cell: (p) => <ActionGroup><IconButton icon="play" label="Test provider" disabled={p.enabled === false} onClick={() => onTest(p.id)} /><IconButton icon="settings" label="Provider options" onClick={() => onOptions(p.id)} /><IconButton icon="trash" label="Remove provider" danger onClick={() => onRemove(p.id)} /></ActionGroup> }
  ]} /></section>;
}

export function PluginSections({ plugins, summary, onToggle }: { plugins: PluginState; summary: SummaryView; onToggle: (id: string, enabled: boolean) => void }) {
  const items = [...(plugins.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  return <section><SectionTitle label="Plugins" /><DataTable className="plugin-table" rows={items} rowKey={(p) => p.id} empty={<div className="empty">No plugins registered.</div>} columns={[
    { key: "plugin", header: "Plugin", width: "34%", cell: (p) => <PluginSummary plugin={p} /> },
    { key: "status", header: "Status", width: "96px", cell: statePill },
    { key: "type", header: "Type", width: "112px", cell: (p) => p.type || p.category || "middleware" },
    { key: "effect", header: "Effect", width: "17%", cell: mutationText },
    { key: "metric", header: "Metric", width: "15%", cell: (p) => metricForPlugin(p.id, p.category, summary) },
    { key: "actions", header: "Actions", width: "176px", cell: (p) => <PluginActions plugin={p} onToggle={onToggle} /> }
  ]} /></section>;
}

export function configuredProviders(providers: ProviderState): ProviderView[] {
  const source = providers.configuredItems || providers.items || [];
  return source.filter((item) => item.id !== "default");
}

function metricForPlugin(id: string, category: string | undefined, summary: SummaryView) {
  if (id === "context-compressor-plugin") return `${num(summary.savedTokens)} tokens saved`;
  return category || "";
}

function ProviderWeight({ provider, onWeight }: { provider: ProviderView; onWeight: (id: string, share: number) => void | Promise<void> }) {
  const [draft, setDraft] = useState(() => roundedShare(provider));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const committingRef = useRef(false);
  useEffect(() => {
    if (dirtyRef.current) return;
    const next = roundedShare(provider);
    draftRef.current = next;
    setDraft(next);
  }, [provider.id, provider.sharePercent, provider.weight]);
  async function commit() {
    if (!dirtyRef.current || committingRef.current || provider.enabled === false) return;
    const value = draftRef.current;
    if (value === roundedShare(provider)) {
      dirtyRef.current = false;
      setDirty(false);
      return;
    }
    committingRef.current = true;
    setSaving(true);
    try {
      await onWeight(provider.id, value);
      dirtyRef.current = false;
      setDirty(false);
    } catch {
      dirtyRef.current = true;
      setDirty(true);
    } finally {
      committingRef.current = false;
      setSaving(false);
    }
  }
  function change(value: number) {
    draftRef.current = value;
    dirtyRef.current = true;
    setDraft(value);
    setDirty(true);
  }
  return <div className="weight-cell"><input type="range" min="0" max="100" step="5" value={draft} disabled={provider.enabled === false || saving} data-dirty={dirty || undefined} onChange={(e) => change(Number(e.target.value))} onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); void commit(); }} onKeyUp={(e) => { if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") void commit(); }} onBlur={() => void commit()} /><b>{draft}%</b></div>;
}

function roundedShare(provider: ProviderView): number {
  return Math.round(Number(provider.sharePercent ?? provider.weight ?? 0));
}

function ProviderUsage({ provider, tokenTotal, reqTotal }: { provider: ProviderView; tokenTotal: number; reqTotal: number }) {
  const base = tokenTotal > 0 ? tokensOf(provider.usage) : Number(provider.usage?.requests || 0);
  const total = tokenTotal > 0 ? tokenTotal : reqTotal;
  const pct = total > 0 ? Math.round((base / total) * 100) : 0;
  return <><div>{num(tokensOf(provider.usage))} tokens</div><div className="rs">{num(provider.usage?.requests)} requests - {eur(provider.usage?.costEur)} - {pct}% load</div></>;
}

function PluginSummary({ plugin }: { plugin: PluginView }) {
  return <div className="plugin-summary"><div className="name">{plugin.name}</div><div className="rs plugin-desc">{plugin.description || plugin.category || ""}</div></div>;
}

function PluginActions({ plugin, onToggle }: { plugin: PluginView; onToggle: (id: string, enabled: boolean) => void }) {
  const enabled = plugin.enabled !== false;
  const label = enabled ? "Turn off" : "Turn on";
  return <ActionGroup>
    {isSafePluginPagePath(plugin.pagePath) ? <IconButton icon="open" label="Open plugin page" onClick={() => openPluginPage(plugin.pagePath || "")} /> : null}
    {plugin.canToggle ? <button type="button" className={`plugin-toggle ${enabled ? "is-on" : "is-off"}`} aria-pressed={enabled} title={label} onClick={() => onToggle(plugin.id, !enabled)}><span className="plugin-toggle-dot" />{label}</button> : null}
  </ActionGroup>;
}

export function openPluginPage(path: string) {
  if (!isSafePluginPagePath(path)) return;
  if (!path) return;
  window.open(path, "_blank", "noopener,noreferrer");
}

export function isSafePluginPagePath(path: string | undefined): boolean {
  return typeof path === "string" && /^\/__molenkopf\/plugins\/[a-z0-9-]+\/page$/.test(path);
}

function statePill(p: { enabled?: boolean; lifecycleStatus?: string }) {
  const label = p.lifecycleStatus || (p.enabled === false ? "disabled" : "enabled");
  return <span className={`pill${label === "disabled" ? " off" : ""}`}>{label}</span>;
}

function mutationText(p: { traffic?: { mutates?: string[] } }) {
  const items = p.traffic?.mutates || [];
  return items.length ? items.join(", ") : "none";
}

function teamPolicy(provider: ProviderView, teams: TeamView[]) {
  if (!teams.length) return "No teams";
  const allowed = teams.filter((team) => team.allowedProviders === "*" || (Array.isArray(team.allowedProviders) && team.allowedProviders.includes(provider.id)));
  if (allowed.length === teams.length) return "All teams";
  return allowed.map((team) => team.name || team.id).join(", ") || "No teams";
}
