import { describe, expect, it } from "vitest";
import { friendlyCheckMessage, readableRuntimeError } from "./ProviderAddPanel";
import { runtimeImportFingerprint, runtimeImportReady } from "./runtimeImportState";

describe("runtimeImportReady", () => {
  it("only allows import after a completed runtime test", () => {
    expect(runtimeImportReady(false, false)).toBe(false);
    expect(runtimeImportReady(false, true)).toBe(false);
    expect(runtimeImportReady(true, true)).toBe(false);
    expect(runtimeImportReady(true, false)).toBe(true);
  });
});

describe("runtimeImportFingerprint", () => {
  it("changes when import-affecting fields change", () => {
    const base = { runtime: "codex", name: "Local", authJson: "{}", profileText: "", activate: true };
    expect(runtimeImportFingerprint(base)).toBe(runtimeImportFingerprint({ ...base }));
    expect(runtimeImportFingerprint(base)).not.toBe(runtimeImportFingerprint({ ...base, authJson: "{\"changed\":true}" }));
    expect(runtimeImportFingerprint(base)).not.toBe(runtimeImportFingerprint({ ...base, profileText: "sandbox = 'read-only'" }));
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

  it("does not echo unknown runtime diagnostics", () => {
    expect(friendlyCheckMessage("stderr Authorization: Bearer raw-token")).toBe("runtime_check_failed");
  });
});
