export const DEFAULT_TEAM_ID = "everyone";

export function isDefaultTeamId(id: string | undefined): boolean {
  return id === DEFAULT_TEAM_ID;
}

export function uniqueTeamIds(teamIds: readonly unknown[] | undefined): string[] {
  const ids = (teamIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)];
}

export function nonDefaultTeamIds(teamIds: readonly unknown[] | undefined): string[] {
  return uniqueTeamIds(teamIds).filter((id) => !isDefaultTeamId(id));
}

export function effectivePolicyTeamIds(teamIds: readonly unknown[] | undefined): string[] {
  const ids = uniqueTeamIds(teamIds);
  const specific = nonDefaultTeamIds(ids);
  return specific.length ? specific : ids;
}

export function scopedIdentityTeamIds(ownerTeamIds: readonly string[], keyTeamId: string | undefined): string[] {
  const owner = uniqueTeamIds(ownerTeamIds);
  const explicitTeams = nonDefaultTeamIds(owner);
  if (!keyTeamId) return explicitTeams.length ? explicitTeams : owner;
  if (isDefaultTeamId(keyTeamId) && explicitTeams.length) return explicitTeams;
  return owner.includes(keyTeamId) ? [keyTeamId] : [];
}
