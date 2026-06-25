import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusMessage } from "./StatusMessage";

describe("StatusMessage", () => {
  it("renders success and error states with semantic roles", () => {
    const ok = renderToString(<StatusMessage tone="success" title="Runtime test passed">Ready.</StatusMessage>);
    const error = renderToString(<StatusMessage tone="error" title="Runtime test failed">Auth failed.</StatusMessage>);

    expect(ok).toContain("status-message success");
    expect(ok).toContain('role="status"');
    expect(ok).toContain("Runtime test passed");
    expect(error).toContain("status-message error");
    expect(error).toContain('role="alert"');
    expect(error).toContain("Runtime test failed");
  });
});
