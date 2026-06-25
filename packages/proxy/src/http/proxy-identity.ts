import { authenticateKey, touchKey } from "../../../core/src/identity/api-keys.ts";
import type { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import { agentIdFromHeaders, deriveClientIdentity, safeSubjectId, type ClientIdentity } from "./client-identity.ts";
import { effectiveProviderAllowlist } from "./provider-access.ts";

// Resolves a proxy request to a client identity. A Molenkopf-issued API key
// maps to its owner user and teams for internal budgets while audit-facing
// labels stay key based.

export type ResolvedIdentity = { client: ClientIdentity; presentedKey: boolean; keyOk: boolean };

export function presentedSecret(headers: Headers): string | undefined {
  const auth = headers.get("authorization");
  if (auth) {
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
    if (token.startsWith("mk_")) return token;
  }
  const xkey = headers.get("x-api-key");
  if (xkey?.startsWith("mk_")) return xkey.trim();
  return undefined;
}

export function resolveClientIdentity(identity: IdentityStore | undefined, headers: Headers): ResolvedIdentity {
  const secret = presentedSecret(headers);
  if (identity && secret) {
    const key = authenticateKey(identity, secret);
    if (key) {
      const owner = identity.getUser(key.ownerUserId);
      const teamIds = owner ? scopedTeamIds(owner.teamIds, key.teamId) : [];
      const agentId = agentIdFromHeaders(headers);
      const client: ClientIdentity = {
        id: `user:${safeSubjectId(key.ownerUserId)}`,
        label: key.agentLabel ? `key:${key.id} agent:${safeSubjectId(key.agentLabel)}` : `key:${key.id}`,
        source: "api_key",
        userId: key.ownerUserId,
        agentId,
        keyAgentLabel: key.agentLabel,
        teamIds,
        keyId: key.id,
        project: key.project,
        allowedProviderIds: effectiveProviderAllowlist(identity, owner, teamIds, key.scopes)
      };
      maybeTouch(identity, key);
      return { client, presentedKey: true, keyOk: true };
    }
    return { client: deriveClientIdentity(headers), presentedKey: true, keyOk: false };
  }
  return { client: deriveClientIdentity(headers), presentedKey: Boolean(secret), keyOk: false };
}

function maybeTouch(store: IdentityStore, key: { lastUsedAt?: string }): void {
  const last = key.lastUsedAt ? Date.parse(key.lastUsedAt) : 0;
  if (Date.now() - last > 60_000) {
    touchKey(store, key as any);
    void store.save();
  }
}

function scopedTeamIds(ownerTeamIds: string[], keyTeamId: string | undefined): string[] {
  if (!keyTeamId) return ownerTeamIds;
  return ownerTeamIds.includes(keyTeamId) ? [keyTeamId] : [];
}
