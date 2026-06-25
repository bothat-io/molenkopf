import type { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import type { User } from "../../../core/src/identity/types.ts";

export type ProviderAllowlist = "*" | string[];

export function effectiveProviderAllowlist(identity: IdentityStore, owner: User | undefined, teamIds: string[], keyScopes: string[] | undefined): ProviderAllowlist {
  const teamAllowlist = owner?.role === "admin" ? "*" : allowlistForTeams(identity, teamIds);
  const keyAllowlist = cleanAllowlist(keyScopes);
  if (!keyAllowlist) return teamAllowlist;
  if (teamAllowlist === "*") return keyAllowlist;
  return keyAllowlist.filter((id) => teamAllowlist.includes(id));
}

export function providerAllowedForClient(client: { allowedProviderIds?: ProviderAllowlist }, providerId: string): boolean {
  const allowed = client.allowedProviderIds;
  if (allowed && allowed !== "*" && !allowed.includes(providerId)) return false;
  return true;
}

function allowlistForTeams(identity: IdentityStore, teamIds: string[]): ProviderAllowlist {
  const providers = new Set<string>();
  for (const teamId of teamIds) {
    const allowed = identity.getTeam(teamId)?.allowedProviders;
    if (allowed === "*") return "*";
    if (Array.isArray(allowed)) for (const providerId of allowed) providers.add(providerId);
  }
  return [...providers];
}

function cleanAllowlist(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}
