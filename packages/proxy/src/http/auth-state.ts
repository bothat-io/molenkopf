import { verifySessionPayload } from "../../../core/src/auth/session.ts";
import type { User } from "../../../core/src/identity/types.ts";
import type { RuntimeState } from "./runtime-state.ts";

// Auth lives on the Identity store (users/teams). With no password-bearing user,
// Molenkopf stays in first-run mode until the browser flow creates an admin.

export type AuthUser = User;

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
