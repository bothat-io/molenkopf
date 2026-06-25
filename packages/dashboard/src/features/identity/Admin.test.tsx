import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminTab } from "./Admin";

describe("AdminTab", () => {
  it("marks enabled users without passwords as not login-ready", () => {
    const html = renderToString(<AdminTab
      data={{
        usage: { users: [], teams: [], keys: [] },
        keys: { items: [] },
        config: {},
        providers: {},
        summary: {},
        plugins: {},
        identity: { users: [{ id: "test", displayName: "Test", role: "member", teamIds: [], hasPassword: false }], teams: [] }
      }}
      providerMessages={{}}
      onAssignUserToTeam={() => {}}
      onEditTeam={() => {}}
      onEditUser={() => {}}
      onNewProvider={() => {}}
      onNewTeam={() => {}}
      onNewUser={() => {}}
      onPluginMove={() => {}}
      onPluginToggle={() => {}}
      onProviderOptions={() => {}}
      onProviderRemove={() => {}}
      onProviderTest={() => {}}
      onProviderWeight={() => {}}
      onRemoveTeam={() => {}}
      onRemoveUser={() => {}}
      onRemoveUserFromTeam={() => {}}
      onTeamKey={() => {}}
      onUserKey={() => {}}
    />);

    expect(html).toContain("no password");
    expect(html).not.toContain("login on");
  });
});
