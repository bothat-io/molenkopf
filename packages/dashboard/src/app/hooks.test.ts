import { describe, expect, it } from "vitest";
import { DASHBOARD_REFRESH_EVENT, DEV_REVISION_INTERVAL_MS, shouldRefreshDashboardOnEvent, tabPath } from "./hooks";

describe("dashboard hooks helpers", () => {
  it("keeps dev revision polling quiet enough for the dashboard", () => {
    expect(DEV_REVISION_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
  });

  it("builds stable dashboard tab paths", () => {
    expect(tabPath("overview")).toBe("/__molenkopf/dashboard/overview");
    expect(tabPath("admin")).toBe("/__molenkopf/dashboard/admin");
  });

  it("refreshes visible dashboards when request events arrive", () => {
    expect(DASHBOARD_REFRESH_EVENT).toBe("request_finished");
    expect(shouldRefreshDashboardOnEvent("visible")).toBe(true);
    expect(shouldRefreshDashboardOnEvent("hidden")).toBe(false);
  });
});
