import { eur, num, tokensOf } from "../../app/format";
import type { UsageTotals } from "../../app/types";
import { UsageVariantFilter, type UsageVariant } from "./UsageVariantFilter";

export function UsageSummary({ summary, teamCount, variants, activeVariantId, onVariantChange }: {
  summary: UsageTotals;
  teamCount: number;
  variants: UsageVariant[];
  activeVariantId: string;
  onVariantChange: (id: string) => void;
}) {
  return <div className="usage-summary-card">
    <div className="usage-summary-head">
      <div className="usage-summary-copy">
        <div className="usage-summary-title">Usage summary</div>
        <div className="usage-summary-kicker">Model / thinking scope</div>
        <UsageVariantFilter variants={variants} activeId={activeVariantId} onChange={onVariantChange} />
      </div>
      <div className="usage-summary-active">{activeLabel(variants, activeVariantId)}</div>
    </div>
    <div className="usage-summary-grid">
      <SummaryMetric label="Requests" value={num(summary.requests || 0)} />
      <SummaryMetric label="Tokens" value={num(tokensOf(summary))} />
      <SummaryMetric label="Cost" value={eur(summary.costEur)} />
      <SummaryMetric label="Teams" value={num(teamCount)} />
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
