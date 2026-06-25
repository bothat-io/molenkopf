export type UpstreamProfile = {
  name: string;
  target: string;
  healthy?: boolean;
  envKey?: string;
  budgetTokens?: number;
  usedTokens?: number;
};

export type RoutingConfig = {
  mode: "fixed" | "manual" | "failover";
  profile?: string;
  profiles: UpstreamProfile[];
};

export function chooseProfile(config: RoutingConfig): UpstreamProfile {
  if (config.mode === "failover") {
    const profile = config.profiles.find((item) => item.healthy !== false && hasBudget(item));
    if (profile) return profile;
    throw new Error("no healthy profile with remaining budget");
  }
  const name = config.profile;
  if (!name) throw new Error(`explicit profile required for ${config.mode} routing`);
  const profile = config.profiles.find((item) => item.name === name);
  if (!profile) throw new Error(`unknown profile: ${name}`);
  if (!hasBudget(profile)) throw new Error(`budget exhausted: ${profile.name}`);
  return profile;
}

export function readCredential(profile: Pick<UpstreamProfile, "envKey">, env: Record<string, string | undefined> = process.env): string | undefined {
  return profile.envKey ? env[profile.envKey] : undefined;
}

export function healthSummary(profiles: UpstreamProfile[]) {
  return profiles.map((item) => ({
    name: item.name,
    target: item.target,
    healthy: item.healthy !== false,
    budgetRemaining: item.budgetTokens === undefined ? undefined : Math.max(0, item.budgetTokens - (item.usedTokens ?? 0))
  }));
}

function hasBudget(profile: UpstreamProfile): boolean {
  return profile.budgetTokens === undefined || (profile.usedTokens ?? 0) < profile.budgetTokens;
}
