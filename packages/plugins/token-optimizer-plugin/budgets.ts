import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";

export type MetricValue =
  | { state: "available"; value: number; source: "local_estimate" | "provider_reported" | "derived" }
  | { state: "unavailable"; reason: string };

export type TokenBudgetSummary = {
  totalTokens: MetricValue;
  budgetLimit: MetricValue;
  pressure: "low" | "medium" | "high";
  warnings: string[];
};

const MEDIUM_TOKEN_PRESSURE = 50_000;
const HIGH_TOKEN_PRESSURE = 200_000;

export function summarizeBudgetPressure(manifests: readonly AuditManifest[]): TokenBudgetSummary {
  const total = manifests.reduce((sum, manifest) => sum + (manifest.upstreamInputTokens ?? 0) + (manifest.upstreamOutputTokens ?? 0), 0);
  const pressure = total >= HIGH_TOKEN_PRESSURE ? "high" : total >= MEDIUM_TOKEN_PRESSURE ? "medium" : "low";
  const warnings = pressure === "high" ? ["budget_pressure_high"] : pressure === "medium" ? ["budget_pressure_medium"] : [];
  return {
    totalTokens: { state: "available", value: total, source: "provider_reported" },
    budgetLimit: { state: "unavailable", reason: "no_plugin_budget_limit_configured" },
    pressure,
    warnings
  };
}
