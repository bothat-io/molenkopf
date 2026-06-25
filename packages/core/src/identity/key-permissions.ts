import type { KeyPermissions, User } from "./types.ts";

export type ResolvedKeyPermissions = Required<KeyPermissions>;

export function resolveKeyPermissions(user: Pick<User, "keyPermissions"> | undefined): ResolvedKeyPermissions {
  return {
    create: user?.keyPermissions?.create !== false,
    revoke: user?.keyPermissions?.revoke !== false
  };
}

export function canCreateOwnKey(user: Pick<User, "keyPermissions"> | undefined): boolean {
  return resolveKeyPermissions(user).create;
}

export function canRevokeOwnKey(user: Pick<User, "keyPermissions"> | undefined): boolean {
  return resolveKeyPermissions(user).revoke;
}
