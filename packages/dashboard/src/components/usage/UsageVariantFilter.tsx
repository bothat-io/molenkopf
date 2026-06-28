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
    <TextChoice label="All" active={activeId === "all"} onClick={() => onChange("all")} />
    {grouped.map((group) => <div className="usage-filter-group" key={group.model}>
      <TextChoice label={group.modelVariant.label} active={activeId === group.modelVariant.id} onClick={() => onChange(group.modelVariant.id)} />
      {group.children.length ? <span className="usage-filter-children" aria-label={`${group.model} variants`}>
        [
        {group.children.map((variant, index) => <span className="usage-filter-child" key={variant.id}>
          {index ? <span className="usage-filter-separator"> / </span> : null}
          <TextChoice label={variant.detail || variant.label} active={activeId === variant.id} onClick={() => onChange(variant.id)} title={`${variant.model} ${variant.detail}`} />
        </span>)}
        ]
      </span> : null}
    </div>)}
  </div>;
}

function TextChoice({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title?: string }) {
  return <button type="button" className={active ? "active" : ""} onClick={onClick} title={title || label}>
    {label}
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
