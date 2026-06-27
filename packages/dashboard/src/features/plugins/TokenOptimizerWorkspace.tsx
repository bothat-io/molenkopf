import { DashboardSection } from "../../components/layout/DashboardSection";
import type { TokenOptimizerData } from "../../app/types";

export function TokenOptimizerWorkspace({ data }: { data?: TokenOptimizerData }) {
  return <DashboardSection title="Token Optimizer">
    <p>Requests: {data?.observations?.requests ?? 0}</p>
    <p>Input tokens: {data?.observations?.inputTokens ?? 0}</p>
    <p>Budget pressure: {data?.budgets?.pressure || "unknown"}</p>
    <p>Estimated cost: {metricText(data?.estimatedCostEur)}</p>
    <p>Cache savings: {metricText(data?.cacheSavings)}</p>
    <div>
      {(data?.recommendations || []).map((item) => <p key={item.id}>{item.summary}</p>)}
      {!data?.recommendations?.length ? <p>No recommendations.</p> : null}
    </div>
  </DashboardSection>;
}

function metricText(value: { state?: string; value?: number; reason?: string } | undefined) {
  if (!value || value.state !== "available") return value?.reason || "unavailable";
  return String(value.value ?? 0);
}
