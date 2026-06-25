import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthLoadingView } from "./AuthViews";

describe("AuthLoadingView", () => {
  it("renders only the loading shell and logo", () => {
    const html = renderToString(<AuthLoadingView />);

    expect(html).toContain("auth-screen auth-loading");
    expect(html).toContain("Loading session");
    expect(html).toContain("molenkopf-logo.png");
    expect(html).not.toContain("Sign in");
  });
});
