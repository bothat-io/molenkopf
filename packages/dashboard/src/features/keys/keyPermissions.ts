import type { UserView } from "../../app/types";

export function canCreateOwnKey(user: UserView | undefined): boolean {
  return user?.keyPermissions?.create !== false;
}

export function canRevokeOwnKey(user: UserView | undefined): boolean {
  return user?.keyPermissions?.revoke !== false;
}

export function keyPermissionIds(user: UserView | undefined): string[] {
  const permissions = user?.keyPermissions as Record<string, boolean | undefined> | undefined;
  return ["create", "revoke"].filter((id) => permissions?.[id] !== false);
}
