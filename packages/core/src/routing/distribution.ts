// Weighted token distribution across providers. The provider currently furthest
// below its target share of total tokens is chosen next, so equal weights give a
// fair split and unequal weights (e.g. 80/20) hold the configured ratio over time.

export type ProviderShare = { id: string; weight: number; usedTokens: number };

export function chooseByDistribution(shares: ProviderShare[]): string | undefined {
  const enabled = shares.filter((share) => share.weight > 0);
  if (!enabled.length) return undefined;
  const totalWeight = enabled.reduce((sum, share) => sum + share.weight, 0);
  const totalUsed = enabled.reduce((sum, share) => sum + Math.max(0, share.usedTokens), 0);
  let bestId: string | undefined;
  let bestDeficit = -Infinity;
  for (const share of enabled) {
    const target = (share.weight / totalWeight) * (totalUsed + 1);
    const deficit = target - Math.max(0, share.usedTokens);
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestId = share.id;
    }
  }
  return bestId;
}

// Normalizes provider weights into display shares (percent of total weight).
export function weightShares(shares: { id: string; weight: number }[]): Record<string, number> {
  const total = shares.reduce((sum, share) => sum + Math.max(0, share.weight), 0);
  const out: Record<string, number> = {};
  for (const share of shares) out[share.id] = total > 0 ? Math.round((Math.max(0, share.weight) / total) * 1000) / 10 : 0;
  return out;
}
