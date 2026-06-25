import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamDialog } from "./TeamDialog";

describe("TeamDialog", () => {
  it("keeps membership out of team settings", () => {
    const html = renderToString(<TeamDialog close={() => {}} reload={() => {}} team={{ id: "alpha", name: "Alpha", allowedProviders: "*" }} providers={[]} />);

    expect(html).toContain("Allowed providers");
    expect(html).not.toContain("Members");
    expect(html).not.toContain("Team members");
  });
});
