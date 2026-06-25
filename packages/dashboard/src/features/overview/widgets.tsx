import { num } from "../../app/format";

export function BudgetMeter({ used, limit, period }: { used: number; limit?: number; period?: string }) {
  if (!limit) return <span className="rs">unlimited</span>;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const state = pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
  const suffix = period && period !== "total" ? `/${period}` : "";
  return <div className="budget">
    <div className={`meter ${state}`}><span style={{ width: `${Math.max(2, pct)}%` }} /></div>
    <span className="rs">{num(used)} / {num(limit)} tok{suffix} - {pct}%</span>
  </div>;
}
