import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { runtimeCliArgs, runtimeProfileFromImport } from "../src/runtime/runtime-profile.ts";
import { viewRuntimeProfile } from "../../core/src/providers/provider-catalog.ts";

test("Claude profile import validates and applies effective permissions", () => {
  const imported = runtimeProfileFromImport({
    profileText: JSON.stringify({
      permissionMode: "auto",
      permissions: { allow: ["Bash(git status)"], deny: ["WebFetch"] },
      addDirs: ["C:\\worktree"]
    })
  }, "claude");

  assert.deepEqual(imported.profile?.summary, ["Claude settings", "mode auto", "1 allowed tools", "1 denied tools", "1 add dirs"]);
  assert.deepEqual(runtimeCliArgs("claude", "C:\\auth", imported.profile), [
    "--print",
    "--settings",
    join("C:\\auth", "settings.json"),
    "--permission-mode",
    "auto",
    "--allowedTools",
    "Bash(git status)",
    "--disallowedTools",
    "WebFetch",
    "--add-dir",
    "C:\\worktree"
  ]);
  assert.deepEqual(viewRuntimeProfile(imported.profile)?.diagnostics, {
    settingsSource: "settings.json",
    configSource: undefined,
    permissionMode: "auto",
    sandbox: undefined,
    approval: undefined,
    allowedToolCount: 1,
    deniedToolCount: 1,
    addDirCount: 1,
    outerHarness: "unknown",
    remediation: "If the host client still asks, approve that prompt or configure this project in .claude/settings.json; Molenkopf cannot bypass a separate Claude/Codex harness."
  });
});

test("invalid imported runtime profile enums fail loudly", () => {
  assert.throws(() => runtimeProfileFromImport({
    profileText: JSON.stringify({ permissionMode: "root" })
  }, "claude"), /invalid_permission_mode/);

  assert.throws(() => runtimeProfileFromImport({
    profileText: 'sandbox_mode = "admin"\n'
  }, "codex"), /invalid_sandbox/);

  assert.throws(() => runtimeProfileFromImport({
    profileText: 'approval_policy = "sometimes"\n'
  }, "codex"), /invalid_approval/);
});

test("Codex profile import accepts current config field names", () => {
  const configToml = 'sandbox_mode = "workspace_write"\napproval_policy = "on_request"\n';
  const imported = runtimeProfileFromImport({
    profileText: configToml
  }, "codex");

  assert.deepEqual(imported.profile?.summary, ["Codex config", "sandbox workspace-write", "approval on-request"]);
  assert.equal(imported.configToml, configToml.trim());
  assert.deepEqual(runtimeCliArgs("codex", "C:\\auth", imported.profile), [
    "exec",
    "--sandbox",
    "workspace-write",
    "-c",
    'approval_policy="on-request"'
  ]);
});

test("Codex profile import stores full config files and summarizes safe fields", () => {
  const imported = runtimeProfileFromImport({
    profileText: [
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      "dangerously_bypass_approvals_and_sandbox = true",
      'model = "gpt-5.5"',
      'model_reasoning_effort = "xhigh"',
      "",
      "[projects.'c:\\example\\workspace\\app-alpha']",
      'trust_level = "trusted"',
      "",
      "[windows]",
      'sandbox = "elevated"',
      "",
      "[notice]",
      "hide_rate_limit_model_nudge = true"
    ].join("\n")
  }, "codex");

  assert.deepEqual(imported.profile?.summary, ["Codex config", "sandbox danger-full-access", "approval never"]);
  assert.deepEqual(runtimeCliArgs("codex", "C:\\auth", imported.profile), ["exec", "--sandbox", "danger-full-access", "-c", 'approval_policy="never"']);
  assert.match(imported.configToml ?? "", /\[projects\.'c:\\example\\workspace\\app-alpha'\]/);
});

test("runtime profile import rejects broad or traversing addDirs", () => {
  assert.throws(() => runtimeProfileFromImport({ addDirs: [".."] }, "claude"), /invalid_add_dir/);
  assert.throws(() => runtimeProfileFromImport({ addDirs: ["~/workspace"] }, "claude"), /invalid_add_dir/);
  assert.throws(() => runtimeProfileFromImport({ addDirs: ["/"] }, "claude"), /invalid_add_dir/);

  const imported = runtimeProfileFromImport({ addDirs: ["workspace/a", "workspace/a"] }, "codex");
  assert.deepEqual(imported.profile?.addDirs, [join("workspace", "a")]);
});
