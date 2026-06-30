import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { authRequired, canManage, type AuthUser } from "./auth-state.ts";

export function filterAuditForUser(state: RuntimeState, user: AuthUser | undefined, manifests: AuditManifest[]): AuditManifest[] {
  const allowed = auditFilterForUser(state, user);
  return allowed ? manifests.filter(allowed) : manifests;
}

export function auditFilterForUser(state: RuntimeState, user: AuthUser | undefined): ((manifest: AuditManifest) => boolean) | undefined {
  if (canReadAllLocal(state, user)) return undefined;
  if (!user) return () => false;
  const teams = readableTeamIds(state, user);
  const keys = ownedKeyIds(state, user.id);
  return (manifest) => manifestAllowed(manifest, user, teams, keys);
}

export function consumerAllowed(state: RuntimeState, user: AuthUser | undefined, id: string): boolean {
  if (canReadAllLocal(state, user)) return true;
  if (!user) return false;
  if (id === `user:${user.id}`) return true;
  return ownedKeyIds(state, user.id).has(id);
}

function canReadAllLocal(state: RuntimeState, user: AuthUser | undefined): boolean {
  return !authRequired(state) || canManage(state, user);
}

function manifestAllowed(manifest: AuditManifest, user: AuthUser, teams: Set<string>, keys: Set<string>): boolean {
  const client = manifest.client;
  if (!client) return false;
  if (client.userId === user.id || client.id === `user:${user.id}`) return true;
  if (client.keyId && keys.has(client.keyId)) return true;
  return Boolean(client.teamIds?.some((id) => teams.has(id)));
}

function readableTeamIds(state: RuntimeState, user: AuthUser): Set<string> {
  const ids = new Set(user.teamIds.filter((id) => id !== "everyone"));
  for (const team of Object.values(state.identity?.data.teams ?? {})) {
    if (team.managerIds.includes(user.id)) ids.add(team.id);
  }
  return ids;
}

function ownedKeyIds(state: RuntimeState, userId: string): Set<string> {
  return new Set(Object.values(state.identity?.data.keys ?? {}).filter((key) => key.ownerUserId === userId).map((key) => key.id));
}
