import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyManagerDialog } from "./KeyManagerDialog";
import type { ApiKeyView, TeamView, UserView } from "../../app/types";

describe("KeyManagerDialog", () => {
  const users: UserView[] = [
    { id: "bob", displayName: "Bob", role: "member", teamIds: ["everyone", "alpha"] },
    { id: "ana", displayName: "Ana", role: "member", teamIds: ["everyone", "beta"] }
  ];
  const teams: TeamView[] = [
    { id: "everyone", name: "Everyone" },
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" }
  ];
  const keys: ApiKeyView[] = [
    { id: "key_alpha", prefix: "mk_alpha", ownerUserId: "bob", teamId: "alpha", project: "project-alpha", agentLabel: "Alpha key" },
    { id: "key_beta", prefix: "mk_beta", ownerUserId: "ana", teamId: "beta", project: "project-beta", agentLabel: "Beta key" }
  ];

  it("shows all keys for a user scope and keeps project metadata editable", () => {
    const html = renderToString(<KeyManagerDialog close={() => {}} reload={() => {}} owner={users[0]} users={users} teams={teams} keys={keys} onKeyCreated={() => {}} />);

    expect(html).toContain("Bob API keys");
    expect(html).toContain("project-alpha");
    expect(html).not.toContain("project-beta");
    expect(html).toContain("Edit API key");
    expect(html).toContain("New project key");
  });

  it("shows only team-bound keys and eligible owners for a team scope", () => {
    const html = renderToString(<KeyManagerDialog close={() => {}} reload={() => {}} team={teams[1]} users={users} teams={teams} keys={keys} onKeyCreated={() => {}} />);

    expect(html).toContain("Alpha API keys");
    expect(html).toContain("Alpha key");
    expect(html).toContain("Bob");
    expect(html).not.toContain("Beta key");
    expect(html).not.toContain("Ana");
  });
});
