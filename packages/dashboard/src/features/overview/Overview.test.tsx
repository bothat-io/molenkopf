import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewTab } from "./Overview";

describe("OverviewTab", () => {
  it("renders read-only status instead of configuration controls", () => {
    const html = renderToString(<OverviewTab
      config={{ bindHost: "127.0.0.1", port: 8787 }}
      currentUser={{ id: "member-a", displayName: "Member Alpha", role: "member", teamIds: ["alpha"] }}
      keys={[{ id: "k1", prefix: "mk_a", ownerUserId: "member-a", project: "alpha", teamId: "alpha" }]}
      usage={{ users: [{ id: "member-a", displayName: "Member Alpha", role: "member", teamIds: ["alpha"], usage: { requests: 2, inputTokens: 3, outputTokens: 4, models: { "gpt-live-test": { requests: 2, inputTokens: 3, outputTokens: 4, reasoning: { xhigh: { requests: 2, inputTokens: 3, outputTokens: 4 } } } }, savedTokens: 99 } as any }], teams: [{ id: "alpha", name: "Alpha", members: 1 }] }}
      selectedSecret=""
      onNewKey={() => {}}
      onRevoke={() => {}}
    />);
    expect(html).toContain("Quick status");
    expect(html).toContain("Usage summary");
    expect(html).toContain("Usage gauge");
    expect(html).toContain("unlimited");
    expect(html).not.toContain("no budget");
    expect(html).toContain("Token mix");
    expect(html).toContain("Models used");
    expect(html).toContain("gpt-live-test");
    expect(html).toContain("xhigh");
    expect(html).not.toContain("Saved");
    expect(html).toContain("My teams");
    expect(html).toContain("Team members");
    expect(html).toContain("My project keys");
    expect(html).toContain("Connect your tool");
    expect(html).toContain("alpha");
  });

  it("renders a budget gauge only when the current user has a budget", () => {
    const html = renderToString(<OverviewTab
      config={{ bindHost: "127.0.0.1", port: 8787 }}
      currentUser={{ id: "member-a", displayName: "Member Alpha", role: "member", teamIds: ["alpha"], budget: { tokenLimit: 20, period: "month" } }}
      keys={[]}
      usage={{ users: [{ id: "member-a", displayName: "Member Alpha", role: "member", teamIds: ["alpha"], budget: { tokenLimit: 20, period: "month" }, usage: { inputTokens: 6, outputTokens: 4 } }], teams: [] }}
      selectedSecret=""
      onNewKey={() => {}}
      onRevoke={() => {}}
    />);

    expect(html).toContain("Budget gauge");
    expect(html).toContain("50%");
  });

  it("scopes teams and members to the current user's teams", () => {
    const html = renderToString(<OverviewTab
      config={{ bindHost: "127.0.0.1", port: 8787 }}
      currentUser={{ id: "member-a", displayName: "Member Alpha", role: "member", teamIds: ["alpha"] }}
      keys={[]}
      usage={{
        users: [
          { id: "member-a", displayName: "Member Alpha", role: "member", teamIds: ["alpha"], usage: { requests: 2 } },
          { id: "member-b", displayName: "Member Beta", role: "member", teamIds: ["beta"], usage: { requests: 9 } }
        ],
        teams: [
          { id: "alpha", name: "Alpha", members: 1 },
          { id: "beta", name: "Beta", members: 1 }
        ]
      }}
      selectedSecret=""
      onNewKey={() => {}}
      onRevoke={() => {}}
    />);

    expect(html).toContain("Alpha");
    expect(html).toContain("Member Alpha");
    expect(html).not.toContain("Beta");
    expect(html).not.toContain("Member Beta");
  });
});
