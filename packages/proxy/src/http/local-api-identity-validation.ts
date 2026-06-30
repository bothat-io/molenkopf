import type { KeyPermissions, Role } from "../../../core/src/identity/types.ts";

export type ParsedRole = { ok: true; role: Role } | { ok: false; error: "invalid_role" };
export type ParsedKeyPermissions = { ok: true; keyPermissions?: KeyPermissions } | { ok: false; error: "invalid_key_permissions" };

export function parseRolePayload(value: unknown, fallback: Role = "member"): ParsedRole {
  if (value === undefined) return { ok: true, role: fallback };
  return value === "admin" || value === "manager" || value === "member"
    ? { ok: true, role: value }
    : { ok: false, error: "invalid_role" };
}

export function parseKeyPermissionsPayload(value: unknown, existing: KeyPermissions | undefined): ParsedKeyPermissions {
  if (value === undefined) return { ok: true, keyPermissions: existing };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid_key_permissions" };
  const permissions = value as Record<string, unknown>;
  const next: KeyPermissions = { ...(existing ?? {}) };
  if ("create" in permissions) {
    if (typeof permissions.create !== "boolean") return { ok: false, error: "invalid_key_permissions" };
    next.create = permissions.create;
  }
  if ("revoke" in permissions) {
    if (typeof permissions.revoke !== "boolean") return { ok: false, error: "invalid_key_permissions" };
    next.revoke = permissions.revoke;
  }
  return { ok: true, keyPermissions: next };
}
