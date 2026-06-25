import { hashPassword, passwordTooLong } from "../../../core/src/auth/password.ts";
import { verifySessionPayload } from "../../../core/src/auth/session.ts";
import type { IdentityStore } from "../../../core/src/identity/identity-store.ts";
import type { User } from "../../../core/src/identity/types.ts";
import type { RuntimeState } from "./runtime-state.ts";

// Auth now lives on the Identity store (users/teams). It stays opt-in: with no
// password-bearing user configured, Molenkopf runs open (single local user).
// MOLENKOPF_ADMIN_PASSWORD seeds an admin IN MEMORY at startup (never persisted),
// so an env-only admin doesn't pollute the on-disk identity data.

export type AuthUser = User;

// Seeds the env admin directly into the identity store's in-memory data without
// persisting, and ensures a default team exists. Idempotent.
export function seedAdminFromEnv(identity: IdentityStore, env: Record<string, string | undefined>): void {
  const password = env.MOLENKOPF_ADMIN_PASSWORD;
  if (!password || password.length < 10 || passwordTooLong(password)) return;
  if (Object.values(identity.data.users).some((u) => u.role === "admin")) return;
  if (!identity.getTeam("everyone")) {
    identity.data.teams.everyone = { id: "everyone", name: "Everyone", allowedProviders: "*", managerIds: ["admin"], createdAt: new Date().toISOString() };
  }
  identity.data.users.admin = { id: "admin", displayName: "Admin", role: "admin", password: hashPassword(password), teamIds: ["everyone"], sessionVersion: 0, createdAt: new Date().toISOString() };
  identity.markEphemeralUser("admin");
}

export function authRequired(state: RuntimeState): boolean {
  const users = state.identity?.data.users ?? {};
  return Object.values(users).some((u) => Boolean(u.password?.hash));
}

export function currentUser(state: RuntimeState, cookieHeader: string | null): User | undefined {
  const token = readCookie(cookieHeader, "molenkopf_session");
  const session = verifySessionPayload(token, state.sessionSecret);
  const user = session ? state.identity?.getUser(session.userId) : undefined;
  if (user && (user.sessionVersion ?? 0) !== session?.sessionVersion) return undefined;
  return user && !user.disabled ? user : undefined;
}

export function canManage(_state: RuntimeState, user: User | undefined): boolean {
  return Boolean(user && user.role === "admin");
}

export function providerAllowed(state: RuntimeState, user: User | undefined, providerId: string): boolean {
  if (!user || user.role === "admin") return true;
  return (user.teamIds ?? []).some((id) => {
    const allowed = state.identity?.getTeam(id)?.allowedProviders;
    return allowed === "*" || (Array.isArray(allowed) && allowed.includes(providerId));
  });
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try { return decodeURIComponent(v.join("=")); } catch { return undefined; }
    }
  }
  return undefined;
}
