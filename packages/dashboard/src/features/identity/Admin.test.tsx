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

  it("distinguishes account suspension from login disablement", () => {
    const html = renderToString(<AdminTab
      data={{
        usage: { users: [], teams: [], keys: [] },
        keys: { items: [] },
        config: {},
        providers: {},
        summary: {},
        plugins: {},
        identity: { users: [
          { id: "suspended", displayName: "Suspended", role: "member", teamIds: [], disabled: true, hasPassword: true },
          { id: "nologin", displayName: "No Login", role: "member", teamIds: [], loginDisabled: true, hasPassword: true }
        ], teams: [] }
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

    expect(html).toContain("account off");
    expect(html).toContain("login off");
  });
});
