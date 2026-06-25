import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Shell } from "./Shell";

describe("Shell", () => {
  it("renders compact chrome and hides admin for non-managers", () => {
    const html = renderToString(<Shell user={{ id: "member-a", role: "member" }} canManage={false} activeTab="overview" onTab={() => {}} onLogout={() => {}}><div>body</div></Shell>);
    expect(html).toContain("Molenkopf");
    expect(html).toContain("connected");
    expect(html).toContain(">Overview<");
    expect(html).not.toContain(">Config<");
    expect(html).not.toContain(">Admin<");
  });

  it("renders the current connection status", () => {
    const html = renderToString(<Shell user={{ id: "admin", role: "admin" }} canManage activeTab="overview" connection="offline" onTab={() => {}} onLogout={() => {}}><div>body</div></Shell>);
    expect(html).toContain("offline");
    expect(html).not.toContain(">connected<");
  });

  it("marks the tab bar as syncing while loading dashboard data", () => {
    const html = renderToString(<Shell user={{ id: "admin", role: "admin" }} canManage activeTab="admin" connection="syncing" onTab={() => {}} onLogout={() => {}}><div>body</div></Shell>);
    expect(html).toContain("wrap syncing");
  });
});
