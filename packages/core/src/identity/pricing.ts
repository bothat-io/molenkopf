// Local, manually-maintained price table → € cost. No network lookups (invariant).
// Prices are per 1,000,000 tokens, keyed by provider id; 0/absent means free.

export type ProviderPrice = { inPerMTok: number; outPerMTok: number };
export type PriceTable = Record<string, ProviderPrice>;

export function costEur(price: ProviderPrice | undefined, inputTokens: number, outputTokens: number): number {
  if (!price) return 0;
  const cost = (inputTokens / 1_000_000) * (price.inPerMTok || 0) + (outputTokens / 1_000_000) * (price.outPerMTok || 0);
  return Math.round(cost * 1e6) / 1e6; // round to micro-euro to avoid float drift
}
