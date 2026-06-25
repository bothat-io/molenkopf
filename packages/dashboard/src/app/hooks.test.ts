import { describe, expect, it } from "vitest";
import { DEV_REVISION_INTERVAL_MS, tabPath } from "./hooks";

describe("dashboard hooks helpers", () => {
  it("keeps dev revision polling quiet enough for the dashboard", () => {
    expect(DEV_REVISION_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
  });

  it("builds stable dashboard tab paths", () => {
    expect(tabPath("overview")).toBe("/__molenkopf/dashboard/overview");
    expect(tabPath("admin")).toBe("/__molenkopf/dashboard/admin");
  });
});
