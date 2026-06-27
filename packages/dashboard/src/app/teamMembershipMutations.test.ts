import { describe, expect, it } from "vitest";
import { buildAssignUserToTeamBody, buildRemoveUserFromTeamBody } from "./teamMembershipMutations";

const data = {
  usage: {},
  keys: { items: [] },
  config: {},
  providers: {},
  summary: {},
  plugins: {},
  identity: {
    users: [{ id: "alice", displayName: "Alice", role: "member", teamIds: ["teamA"] }],
    teams: []
  }
};

describe("teamMembershipMutations", () => {
  it("builds add/remove payloads without mutating unrelated fields", () => {
    expect(buildAssignUserToTeamBody(data as any, "alice", "teamB")).toMatchObject({ id: "alice", teamIds: ["teamA", "teamB"] });
    expect(buildRemoveUserFromTeamBody(data as any, "alice", "teamA")).toMatchObject({ id: "alice", teamIds: [] });
  });

  it("ignores unsupported targets", () => {
    expect(buildAssignUserToTeamBody(data as any, "alice", "_unassigned")).toBeUndefined();
    expect(buildRemoveUserFromTeamBody(data as any, "alice", "everyone")).toBeUndefined();
  });
});
