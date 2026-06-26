import { describe, expect, it } from "vitest";
import { textFileSizeError } from "../../components/forms/FormControls";
import { clearRuntimeDraft, friendlyCheckMessage, readableRuntimeError, runtimeImportBody, type RuntimeDraft } from "./RuntimeImportForm";
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

describe("runtime import draft cleanup", () => {
  it("clears raw auth drafts while preserving selected runtime and optional name", () => {
    const draft: RuntimeDraft = {
      runtime: "codex",
      name: "Local",
      authJson: "{\"token\":\"secret\"}",
      profileText: "secret_profile",
      authFileName: "auth.json",
      profileFileName: "config.toml",
      importProof: "proof"
    };
    expect(clearRuntimeDraft(draft, { runtime: "claude", name: draft.name })).toEqual({
      runtime: "claude",
      name: "Local",
      authJson: "",
      profileText: "",
      authFileName: "",
      profileFileName: "",
      importProof: ""
    });
  });

  it("builds import bodies without file names or proof state", () => {
    const body = runtimeImportBody({
      runtime: "codex",
      name: "Local",
      authJson: "{}",
      profileText: "",
      authFileName: "auth.json",
      profileFileName: "",
      importProof: "proof"
    });
    expect(body).toEqual({ runtime: "codex", name: "Local", authJson: "{}", profileText: "", activate: true });
  });

  it("rejects oversized file reads before text loading", () => {
    expect(textFileSizeError({ size: 10 }, 10)).toBe("");
    expect(textFileSizeError({ size: 11 }, 10)).toBe("file_too_large");
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
