import { describe, expect, it } from "vitest";
import { friendlyCheckMessage, readableRuntimeError, runtimeImportReady } from "./ProviderAddPanel";

describe("runtimeImportReady", () => {
  it("only allows import after a completed runtime test", () => {
    expect(runtimeImportReady(false, false)).toBe(false);
    expect(runtimeImportReady(false, true)).toBe(false);
    expect(runtimeImportReady(true, true)).toBe(false);
    expect(runtimeImportReady(true, false)).toBe(true);
  });
});

describe("readableRuntimeError", () => {
  it("explains low-level runtime import errors for the dashboard", () => {
    expect(readableRuntimeError("invalid_sandbox")).toContain("Unsupported Codex sandbox value");
    expect(readableRuntimeError("missing_auth_json")).toContain("auth.json");
    expect(readableRuntimeError("other_error")).toBe("other_error");
  });
});

describe("friendlyCheckMessage", () => {
  it("collapses local CLI auth diagnostics into an actionable message", () => {
    const raw = "local cli provider exited with 2; lifecycle: spawned -> close code=2; output_class:auth_failure";
    expect(friendlyCheckMessage(raw)).toContain("Local CLI authentication failed");
    expect(friendlyCheckMessage(raw)).not.toContain("lifecycle");
  });
});
