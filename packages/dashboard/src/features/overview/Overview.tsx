import { useMemo, useState } from "react";
import { DashboardSection } from "../../components/layout/DashboardSection";
import { num, shortDate, tokensOf } from "../../app/format";
import { OverviewDetails } from "./OverviewDetails";
import { SelfServiceKeys } from "../keys/SelfServiceKeys";
import { UsageSummary } from "../../components/usage/UsageSummary";
import type { UsageVariant } from "../../components/usage/UsageVariantFilter";
import type { ApiKeyView, ConfigView, ModelUsageTotals, ProviderView, TeamView, UsageTotals, UsageView, UserView } from "../../app/types";
import "./Overview.css";

export function OverviewTab({ usage, currentUser, keys, config, providers = [], selectedSecret, onNewKey, onRevoke }: { usage: UsageView; currentUser?: UserView; keys: ApiKeyView[]; config: ConfigView; providers?: ProviderView[]; selectedSecret: string; onNewKey: () => void; onRevoke: (id: string) => void }) {
  const user = currentUser ? { ...currentUser, ...usage.users?.find((item) => item.id === currentUser.id) } : usage.users?.[0];
  const userTeams = teamList(user?.teamIds, usage.teams || []);
  const allSummary = user?.usage || sumUsage(keys.filter((key) => key.ownerUserId === user?.id).map((key) => key.usage));
  const profileThinking = activeProfileThinking(providers);
  const variants = useMemo(() => usageVariants(allSummary, profileThinking), [allSummary, profileThinking]);
  const [activeVariantId, setActiveVariantId] = useState("all");
  const activeVariant = variants.find((variant) => variant.id === activeVariantId);
  const summary = activeVariant?.usage || allSummary;
  const ownKeys = keys.filter((key) => key.ownerUserId === user?.id);
  const keyCount = ownKeys.filter((key) => !key.disabled).length;
  const lastUsed = latestKeyUse(ownKeys);
  return <>
    <DashboardSection title="Quick status">
      <div className="overview-hero"><div><h2>{displayUser(user)}</h2><p>{userTeams || "No team assigned"} - {config.bindHost || "127.0.0.1"}:{config.port || 8787}</p></div><div className="scope-tags"><span className="pill">{keyCount} active keys</span><span className="pill off">last used {lastUsed}</span></div></div>
    </DashboardSection>
    <DashboardSection title="Usage summary">
      <UsageSummary
        summary={summary}
        teamCount={user?.teamIds?.length || 0}
        variants={variants}
        activeVariantId={activeVariantId}
        onVariantChange={setActiveVariantId}
        budget={user?.budget}
      />
    </DashboardSection>
    <OverviewDetails usage={usage} currentUser={user} />
    <SelfServiceKeys keys={ownKeys} currentUser={user} config={config} selectedSecret={selectedSecret} onNewKey={onNewKey} onRevoke={onRevoke} />
  </>;
}

function usageVariants(usage: UsageTotals, profileThinking?: string): UsageVariant[] {
  return Object.entries(usage.models || {})
    .flatMap(([model, modelUsage]) => modelVariants(model, modelUsage, profileThinking))
    .sort((a, b) => tokensOf(b.usage) - tokensOf(a.usage) || a.label.localeCompare(b.label));
}

function modelVariants(model: string, usage: ModelUsageTotals, profileThinking?: string): UsageVariant[] {
  const reasoningSource = usage.reasoning && Object.keys(usage.reasoning).length ? usage.reasoning : fallbackReasoning(profileThinking, usage);
  const reasoning = Object.entries(reasoningSource || {}).map(([effort, effortUsage]) => ({
    id: `model:${model}:reasoning:${effort}`,
    label: model,
    detail: effort,
    model,
    usage: effortUsage
  }));
  return [{ id: `model:${model}`, label: model, model, usage }, ...reasoning];
}

function fallbackReasoning(profileThinking: string | undefined, usage: ModelUsageTotals): Record<string, ModelUsageTotals> | undefined {
  return profileThinking ? { [profileThinking]: usage } : undefined;
}

function activeProfileThinking(providers: ProviderView[]): string | undefined {
  const active = providers.find((provider) => provider.active) || providers[0];
  const value = active?.runtimeProfile?.diagnostics?.modelReasoningEffort;
  return typeof value === "string" && value ? value : undefined;
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
