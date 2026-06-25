import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamMemberTree } from "./TeamMemberTree";

describe("TeamMemberTree", () => {
  it("keeps groups collapsed and leaves user creation in the users table", () => {
    const html = renderToString(<TeamMemberTree
      teams={[{ id: "everyone", name: "Everyone", allowedProviders: "*" }]}
      users={[
        { id: "alice", displayName: "Alice", role: "member", teamIds: ["everyone"] },
        { id: "bob", displayName: "Bob", role: "member", teamIds: [] }
      ]}
      keys={[{ id: "k1", prefix: "mk_test", ownerUserId: "alice", teamId: "everyone" }]}
      onNewTeam={() => {}}
      onAssignUserToTeam={() => {}}
      onRemoveUserFromTeam={() => {}}
    />);

    expect(html).toContain("+ New team");
    expect(html).not.toContain("+ New user");
    expect(html).not.toContain("Drop");
    expect(html).toContain("everyone - 2 members - 1 keys - All providers");
    expect(html).not.toContain("Unassigned");
    expect(html).not.toContain("<table");
  });
});
