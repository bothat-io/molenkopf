import { describe, expect, it } from "vitest";
import { connectionStatus, shouldPollDashboard } from "./refresh";

describe("refresh helpers", () => {
  it("derives truthful connection state", () => {
    expect(connectionStatus({ loading: true, lastSuccessAt: "2026-06-25T00:00:00.000Z" })).toBe("syncing");
    expect(connectionStatus({ loading: false, lastSuccessAt: "2026-06-25T00:00:00.000Z" })).toBe("connected");
    expect(connectionStatus({ loading: false, lastSuccessAt: "2026-06-25T00:00:00.000Z", lastErrorAt: "2026-06-25T00:00:01.000Z" })).toBe("offline");
    expect(connectionStatus({ loading: false, lastErrorAt: "2026-06-25T00:00:01.000Z" })).toBe("offline");
  });

  it("pauses refresh polling while the tab is hidden", () => {
    expect(shouldPollDashboard("visible")).toBe(true);
    expect(shouldPollDashboard("hidden")).toBe(false);
  });
});
