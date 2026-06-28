import { useMemo, useState, type CSSProperties } from "react";
import { DashboardSection } from "../../components/layout/DashboardSection";
import { eur, num, shortDate, tokensOf } from "../../app/format";
import { MetricStrip } from "../../components/layout/MetricStrip";
import { OverviewDetails } from "./OverviewDetails";
import { SelfServiceKeys } from "../keys/SelfServiceKeys";
import { BudgetMeter } from "./widgets";
import { UsageVariantFilter, type UsageVariant } from "../../components/usage/UsageVariantFilter";
import type { ApiKeyView, ConfigView, ModelUsageTotals, TeamView, UsageTotals, UsageView, UserView } from "../../app/types";
import "./Overview.css";

export function OverviewTab({ usage, currentUser, keys, config, selectedSecret, onNewKey, onRevoke }: { usage: UsageView; currentUser?: UserView; keys: ApiKeyView[]; config: ConfigView; selectedSecret: string; onNewKey: () => void; onRevoke: (id: string) => void }) {
  const user = currentUser ? { ...currentUser, ...usage.users?.find((item) => item.id === currentUser.id) } : usage.users?.[0];
  const userTeams = teamList(user?.teamIds, usage.teams || []);
  const allSummary = user?.usage || sumUsage(keys.filter((key) => key.ownerUserId === user?.id).map((key) => key.usage));
  const variants = useMemo(() => usageVariants(allSummary), [allSummary]);
  const [activeVariantId, setActiveVariantId] = useState("all");
  const activeVariant = variants.find((variant) => variant.id === activeVariantId);
  const summary = activeVariant?.usage || allSummary;
  const ownKeys = keys.filter((key) => key.ownerUserId === user?.id);
  const models = topModels(allSummary);
  const keyCount = ownKeys.filter((key) => !key.disabled).length;
  const lastUsed = latestKeyUse(ownKeys);
  return <>
    <DashboardSection title="Quick status">
      <div className="overview-hero"><div><h2>{displayUser(user)}</h2><p>{userTeams || "No team assigned"} - {config.bindHost || "127.0.0.1"}:{config.port || 8787}</p></div><div className="scope-tags"><span className="pill">{keyCount} active keys</span><span className="pill off">last used {lastUsed}</span></div></div>
    </DashboardSection>
    <DashboardSection title="Usage summary">
      <UsageVariantFilter variants={variants} activeId={activeVariantId} onChange={setActiveVariantId} />
      <MetricStrip items={[{ label: "Requests", value: summary.requests || 0 }, { label: "Tokens", value: tokensOf(summary) }, { label: "Cost", value: eur(summary.costEur) }, { label: "Teams", value: user?.teamIds?.length || 0 }, { label: "Scope", value: activeVariant?.label || "All" }]} />
    </DashboardSection>
    <div className="overview-panels">
      <UsageGauge usage={summary} budget={user?.budget?.tokenLimit} />
      <TokenBars usage={summary} />
      <ModelUsage items={models} />
    </div>
    <OverviewDetails usage={usage} currentUser={user} />
    <SelfServiceKeys keys={ownKeys} currentUser={user} config={config} selectedSecret={selectedSecret} onNewKey={onNewKey} onRevoke={onRevoke} />
  </>;
}

function UsageGauge({ usage, budget }: { usage: UsageTotals; budget?: number }) {
  const used = tokensOf(usage);
  const pct = budget ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  return <DashboardSection title={budget ? "Budget gauge" : "Usage gauge"}><div className="status-panel"><div className="gauge-row"><div className="gauge" style={{ "--pct": `${pct}%` } as CSSProperties}><b>{budget ? `${pct}%` : "usage"}</b></div><div><div className="n">{num(used)}</div><div className="t">tokens used</div><BudgetMeter used={used} limit={budget} period="total" /></div></div></div></DashboardSection>;
}

function TokenBars({ usage }: { usage: UsageTotals }) {
  const input = Number(usage.inputTokens || 0), output = Number(usage.outputTokens || 0);
  const max = Math.max(input, output, 1);
  return <DashboardSection title="Token mix"><div className="status-panel"><div className="bar-list">
    <Bar label="Input" value={input} max={max} />
    <Bar label="Output" value={output} max={max} />
  </div></div></DashboardSection>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className="bar-row"><span>{label}</span><div className="meter"><span style={{ width: `${Math.max(2, Math.round((value / max) * 100))}%` }} /></div><b>{num(value)}</b></div>;
}

function ModelUsage({ items }: { items: { id: string; usage: ModelUsageTotals }[] }) {
  if (!items.length) return null;
  return <DashboardSection title="Models used"><div className="status-panel model-list">
    {items.map((item) => <div className="model-row" key={item.id}>
      <span>{item.id}</span>
      <b>{num(tokensOf(item.usage))} tokens</b>
      <small>{num(item.usage.requests)} requests</small>
    </div>)}
  </div></DashboardSection>;
}

function topModels(usage: UsageTotals): { id: string; usage: ModelUsageTotals }[] {
  return Object.entries(usage.models || {})
    .map(([id, modelUsage]) => ({ id, usage: modelUsage }))
    .sort((a, b) => tokensOf(b.usage) - tokensOf(a.usage) || Number(b.usage.requests || 0) - Number(a.usage.requests || 0) || a.id.localeCompare(b.id))
    .slice(0, 5);
}

function usageVariants(usage: UsageTotals): UsageVariant[] {
  return Object.entries(usage.models || {})
    .flatMap(([model, modelUsage]) => modelVariants(model, modelUsage))
    .sort((a, b) => tokensOf(b.usage) - tokensOf(a.usage) || a.label.localeCompare(b.label));
}

function modelVariants(model: string, usage: ModelUsageTotals): UsageVariant[] {
  const reasoning = Object.entries(usage.reasoning || {}).map(([effort, effortUsage]) => ({
    id: `model:${model}:reasoning:${effort}`,
    label: model,
    detail: effort,
    model,
    usage: effortUsage
  }));
  return [{ id: `model:${model}`, label: model, model, usage }, ...reasoning];
}

function sumUsage(items: (UsageTotals | undefined)[]): UsageTotals {
  return items.reduce<UsageTotals>((sum, item) => mergeUsage(sum, item), {});
}

function mergeUsage(sum: UsageTotals, item: UsageTotals | undefined): UsageTotals {
  const merged = { requests: (sum.requests || 0) + (item?.requests || 0), inputTokens: (sum.inputTokens || 0) + (item?.inputTokens || 0), outputTokens: (sum.outputTokens || 0) + (item?.outputTokens || 0), costEur: (sum.costEur || 0) + (item?.costEur || 0), models: { ...(sum.models || {}) } };
  for (const [id, model] of Object.entries(item?.models || {})) merged.models[id] = mergeUsage(merged.models[id], model);
  for (const [id, reasoning] of Object.entries((item as ModelUsageTotals | undefined)?.reasoning || {})) {
    const target = merged as ModelUsageTotals;
    target.reasoning ??= {};
    target.reasoning[id] = mergeUsage(target.reasoning[id], reasoning);
  }
  return merged;
}

function teamList(ids: string[] | undefined, teams: TeamView[]): string {
  return ids?.map((id) => teams.find((team) => team.id === id)?.name || id).join(", ") || "";
}

function latestKeyUse(keys: ApiKeyView[]): string {
  const dates = keys.map((key) => key.lastUsedAt).filter(Boolean).sort();
  return shortDate(dates.at(-1)) || "never";
}

function displayUser(user: UserView | undefined): string {
  return user?.displayName || user?.id || "Current user";
}
