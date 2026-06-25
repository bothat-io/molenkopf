import type { CSSProperties } from "react";
import { num } from "../../app/format";
import "./MetricStrip.css";

export type MetricItem = { label: string; value: unknown };

export function MetricStrip({ items }: { items: MetricItem[] }) {
  return <section className="metric-strip" style={{ "--metric-count": items.length } as CSSProperties}>
    {items.map((item) => <MetricBox key={item.label} value={item.value} label={item.label} />)}
  </section>;
}

export function MetricBox({ value, label }: MetricItem) {
  return <div className="box"><div className="n">{typeof value === "string" ? value : num(value)}</div><div className="t">{label}</div></div>;
}
