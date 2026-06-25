import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionGroup } from "../actions/ActionGroup";
import { DashboardSection } from "./DashboardSection";

describe("DashboardSection", () => {
  it("renders actions inside valid block markup", () => {
    const html = renderToString(<DashboardSection title="Teams" actions={<ActionGroup><button>New</button></ActionGroup>}><div>Body</div></DashboardSection>);

    expect(html).toContain('<div class="label">');
    expect(html).toContain("action-group");
    expect(html).not.toContain('<p class="label">');
  });
});
