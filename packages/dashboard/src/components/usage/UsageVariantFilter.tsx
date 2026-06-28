import { num, tokensOf } from "../../app/format";
import type { UsageTotals } from "../../app/types";

export type UsageVariant = {
  id: string;
  label: string;
  detail?: string;
  model?: string;
  usage: UsageTotals;
};

export function UsageVariantFilter({ variants, activeId, onChange }: { variants: UsageVariant[]; activeId: string; onChange: (id: string) => void }) {
  if (!variants.length) return null;
  const grouped = groupVariants(variants);
  return <div className="usage-filter" aria-label="Usage filter">
    <button type="button" className={activeId === "all" ? "active" : ""} onClick={() => onChange("all")}>
      <span>All</span>
    </button>
    {grouped.map((group) => <div className="usage-filter-group" key={group.model}>
      <VariantButton variant={group.modelVariant} activeId={activeId} onChange={onChange} />
      {group.children.length ? <div className="usage-filter-children">
        {group.children.map((variant) => <VariantButton key={variant.id} variant={variant} activeId={activeId} onChange={onChange} compact />)}
      </div> : null}
    </div>)}
  </div>;
}

function VariantButton({ variant, activeId, onChange, compact }: { variant: UsageVariant; activeId: string; onChange: (id: string) => void; compact?: boolean }) {
  return <button type="button" className={[activeId === variant.id ? "active" : "", compact ? "compact" : ""].filter(Boolean).join(" ")} onClick={() => onChange(variant.id)} title={variant.detail || variant.label}>
    <span>{variant.detail || variant.label}</span>
    {!compact && variant.detail ? <small>{variant.detail}</small> : null}
    {!compact ? <b>{num(tokensOf(variant.usage))}</b> : null}
  </button>;
}

function groupVariants(variants: UsageVariant[]) {
  const models = variants.filter((variant) => !variant.detail);
  return models.map((modelVariant) => ({
    model: modelVariant.model || modelVariant.label,
    modelVariant,
    children: variants.filter((variant) => variant.model === modelVariant.model && variant.detail)
  }));
}
