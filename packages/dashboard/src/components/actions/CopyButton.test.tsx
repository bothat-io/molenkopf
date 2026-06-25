import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  it("renders a reusable copy action", () => {
    const html = renderToString(<CopyButton text="sample command" />);
    expect(html).toContain("copy-button");
    expect(html).toContain("Copy");
  });
});
