import type { DashboardData } from "./types";

export function buildAssignUserToTeamBody(data: DashboardData, userId: string, teamId: string) {
  const users = data.identity?.users || data.usage.users || [];
  const user = users.find((item) => item.id === userId);
  if (!user || teamId === "_unassigned") return;
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    disabled: user.disabled,
    loginDisabled: user.loginDisabled,
    keyPermissions: user.keyPermissions,
    budget: user.budget,
    teamIds: [...new Set([...(user.teamIds || []), teamId])]
  };
}

export function buildRemoveUserFromTeamBody(data: DashboardData, userId: string, teamId: string) {
  const users = data.identity?.users || data.usage.users || [];
  const user = users.find((item) => item.id === userId);
  if (!user || teamId === "everyone") return;
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    disabled: user.disabled,
    loginDisabled: user.loginDisabled,
    keyPermissions: user.keyPermissions,
    budget: user.budget,
    teamIds: (user.teamIds || []).filter((id) => id !== teamId)
  };
}
