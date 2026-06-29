import type { CSSProperties } from "react";
import { eur, num, tokensOf } from "../../app/format";
import type { Budget, UsageTotals } from "../../app/types";
import { UsageVariantFilter, type UsageVariant } from "./UsageVariantFilter";

export function UsageSummary({ summary, teamCount, variants, activeVariantId, onVariantChange, budget }: {
  summary: UsageTotals;
  teamCount: number;
  variants: UsageVariant[];
  activeVariantId: string;
  onVariantChange: (id: string) => void;
  budget?: Budget;
}) {
  const used = tokensOf(summary);
  return <div className="usage-summary-card">
    <div className="usage-summary-head">
      <div className="usage-summary-copy">
        <div className="usage-summary-title">Usage summary</div>
        <div className="usage-summary-kicker">Model / thinking scope</div>
        <UsageVariantFilter variants={variants} activeId={activeVariantId} onChange={onVariantChange} />
      </div>
      <div className="usage-summary-active">{activeLabel(variants, activeVariantId)}</div>
    </div>
    <div className="usage-summary-body">
      <div className="usage-summary-metrics">
        <SummaryMetric label="Requests" value={num(summary.requests || 0)} />
        <SummaryMetric label="Tokens" value={num(used)} />
        <SummaryMetric label="Cost" value={eur(summary.costEur)} />
        <SummaryMetric label="Teams" value={num(teamCount)} />
      </div>
      <div className="usage-summary-details">
        <UsageGauge used={used} requests={Number(summary.requests || 0)} budget={budget} />
        <TokenMix usage={summary} />
      </div>
    </div>
  </div>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="usage-summary-metric"><div>{value}</div><span>{label}</span></div>;
}

function activeLabel(variants: UsageVariant[], activeId: string): string {
  if (activeId === "all") return "All usage";
  const active = variants.find((variant) => variant.id === activeId);
  if (!active) return "All usage";
  return active.detail ? `${active.model || active.label} / thinking: ${active.detail}` : active.label;
}

function UsageGauge({ used, requests, budget }: { used: number; requests: number; budget?: Budget }) {
  const limit = budget?.tokenLimit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return <section className="usage-summary-detail usage-summary-gauge">
    <div className="usage-summary-gauge-row">
      <div className="gauge" style={{ "--pct": `${pct}%` } as CSSProperties}><b>{limit ? `${pct}%` : "usage"}</b></div>
      <div>
        <span className="usage-summary-detail-label">{limit ? "Budget gauge" : "Usage gauge"}</span>
        <div className="n">{num(used)}</div>
        <div className="t">tokens used</div>
        {requests > 0 && used === 0 ? <span className="rs">provider usage unavailable</span> : null}
        <BudgetLine used={used} budget={budget} />
      </div>
    </div>
  </section>;
}

function BudgetLine({ used, budget }: { used: number; budget?: Budget }) {
  if (!budget?.tokenLimit) return <span className="rs">unlimited</span>;
  const pct = Math.min(100, Math.round((used / budget.tokenLimit) * 100));
  const suffix = budget.period && budget.period !== "total" ? `/${budget.period}` : "";
  return <div className="budget">
    <div className={`meter ${pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok"}`}><span style={{ width: `${Math.max(2, pct)}%` }} /></div>
    <span className="rs">{num(used)} / {num(budget.tokenLimit)} tok{suffix} - {pct}%</span>
  </div>;
}

function TokenMix({ usage }: { usage: UsageTotals }) {
  const input = Number(usage.inputTokens || 0);
  const output = Number(usage.outputTokens || 0);
  const max = Math.max(input, output, 1);
  return <section className="usage-summary-detail usage-summary-token-mix">
    <span className="usage-summary-detail-label">Input / output</span>
    <div className="bar-list">
      <Bar label="Input" value={input} max={max} />
      <Bar label="Output" value={output} max={max} />
    </div>
  </section>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return <div className="bar-row"><span>{label}</span><div className="meter"><span style={{ width: `${Math.max(2, Math.round((value / max) * 100))}%` }} /></div><b>{num(value)}</b></div>;
}
