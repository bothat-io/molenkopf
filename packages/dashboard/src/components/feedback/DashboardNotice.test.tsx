import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardNotice, noticeAutoDismissMs } from "./DashboardNotice";

describe("DashboardNotice", () => {
  it("renders a toned dismissible status", () => {
    const html = renderToString(<DashboardNotice tone="success" onDismiss={() => {}}>Saved</DashboardNotice>);

    expect(html).toContain("dashboard-notice success");
    expect(html).toContain("Saved");
    expect(html).toContain("Dismiss");
  });

  it("keeps errors visible until dismissed", () => {
    expect(noticeAutoDismissMs("success", 4500)).toBe(4500);
    expect(noticeAutoDismissMs("error", 4500)).toBe(0);
  });
});
