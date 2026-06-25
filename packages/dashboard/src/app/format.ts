import type { UsageTotals } from "./types";

export function tokensOf(usage?: UsageTotals): number {
  return Number(usage?.inputTokens || 0) + Number(usage?.outputTokens || 0);
}

export function num(value: unknown): string {
  return Number(value || 0).toLocaleString("en-US");
}

export function eur(value: unknown): string {
  return "EUR " + Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function shortDate(value?: string): string {
  return value ? value.slice(0, 16).replace("T", " ") : "never used";
}

export function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
