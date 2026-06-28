import { join, normalize, posix, win32 } from "node:path";
import type { RuntimeProfileConfig } from "../../../core/src/providers/provider-catalog.ts";
import { ensurePrivateDir, writePrivateFile } from "../../../core/src/storage/private-state.ts";
import { safeClaudeSettingsJson } from "./claude-settings.ts";
import { codexConfigSummary } from "./codex-runtime-config.ts";

type Runtime = "claude" | "codex";
type Body = Record<string, unknown>;

const CLAUDE_MODES = new Set(["default", "acceptEdits", "auto", "bypassPermissions", "dontAsk", "plan"]);
const CODEX_SANDBOX = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_APPROVAL = new Set(["untrusted", "on-failure", "on-request", "never"]);

export type RuntimeProfileImport = { profile?: RuntimeProfileConfig; settingsJson?: string; configToml?: string };

export function runtimeProfileFromImport(body: Body, runtime: Runtime): RuntimeProfileImport {
  const profileText = text(body.profileText);
  const profile = profileFields(body, runtime);
  if (runtime === "claude") {
    const settingsSource = text(body.settingsJson) || profileText;
    const settingsJson = settingsSource ? safeClaudeSettingsJson(settingsSource) : undefined;
    if (settingsSource && !settingsJson) throw new Error("invalid_profile_json");
    const derived = settingsJson ? claudeSettingsSummary(settingsJson) : {};
    return mergeProfile(profile, derived, settingsJson ? { settingsRef: "settings.json" } : {}, { settingsJson });
  }
  const importedConfig = text(body.configToml) || profileText;
  const derived = importedConfig ? codexConfigSummary(importedConfig) : {};
  return mergeProfile(
    profile,
    derived,
    importedConfig ? { configRef: "config.toml" } : {},
    importedConfig ? { configToml: importedConfig } : {}
  );
}

export async function writeRuntimeProfileFiles(authDir: string, runtime: RuntimeProfileImport): Promise<void> {
  if (!runtime.settingsJson && !runtime.configToml) return;
  await ensurePrivateDir(authDir);
  if (runtime.settingsJson) await writePrivateFile(join(authDir, "settings.json"), runtime.settingsJson);
  if (runtime.configToml) await writePrivateFile(join(authDir, "config.toml"), runtime.configToml);
}

export function runtimeCliArgs(runtime: Runtime, authDir: string, profile?: RuntimeProfileConfig): string[] {
  const args = runtime === "claude" ? ["--print"] : ["exec"];
  if (!profile) return args;
  if (runtime === "claude") {
    if (profile.settingsRef) args.push("--settings", join(authDir, "settings.json"));
    if (profile.permissionMode) args.push("--permission-mode", profile.permissionMode);
    pushList(args, "--allowedTools", profile.allowedTools);
    pushList(args, "--disallowedTools", profile.disallowedTools);
    for (const dir of profile.addDirs ?? []) args.push("--add-dir", dir);
  } else {
    if (profile.sandbox) args.push("--sandbox", profile.sandbox);
    if (profile.model) args.push("-m", profile.model);
    if (profile.approval) args.push("-c", `approval_policy="${profile.approval}"`);
    if (profile.modelReasoningEffort) args.push("-c", `model_reasoning_effort="${profile.modelReasoningEffort}"`);
    for (const dir of profile.addDirs ?? []) args.push("--add-dir", dir);
  }
  return args;
}

function profileFields(body: Body, runtime: Runtime): RuntimeProfileConfig | undefined {
  const nested = record(body.profile);
  const source = nested ?? body;
  const profile: RuntimeProfileConfig = {
    permissionMode: runtime === "claude" ? enumValue(source.permissionMode, CLAUDE_MODES, "invalid_permission_mode") : undefined,
    allowedTools: list(source.allowedTools),
    disallowedTools: list(source.disallowedTools),
    addDirs: safeAddDirs(list(source.addDirs)),
    model: runtime === "codex" ? text(field(source, "model")).slice(0, 96) || undefined : undefined,
    modelReasoningEffort: runtime === "codex" ? text(field(source, "modelReasoningEffort", "model_reasoning_effort", "reasoningEffort", "reasoning_effort")).slice(0, 32) || undefined : undefined,
    sandbox: runtime === "codex" ? enumValue(field(source, "sandbox", "sandboxMode", "sandbox_mode"), CODEX_SANDBOX, "invalid_sandbox") : undefined,
    approval: runtime === "codex" ? enumValue(field(source, "approval", "approvalPolicy", "approval_policy"), CODEX_APPROVAL, "invalid_approval") : undefined
  };
  return withSummary(profile);
}

function claudeSettingsSummary(json: string): RuntimeProfileConfig {
  const settings = record(parseJson(json));
  const permissions = record(settings?.permissions);
  return withSummary({
    permissionMode: enumValue(settings?.permissionMode ?? permissions?.defaultMode, CLAUDE_MODES, "invalid_permission_mode"),
    allowedTools: list(settings?.allowedTools ?? permissions?.allow),
    disallowedTools: list(settings?.disallowedTools ?? permissions?.deny),
    addDirs: safeAddDirs(list(settings?.addDirs ?? settings?.additionalDirectories ?? permissions?.addDirs))
  }) ?? {};
}

function mergeProfile(...items: (RuntimeProfileConfig | RuntimeProfileImport | undefined)[]): RuntimeProfileImport {
  const safe = items.filter((item): item is RuntimeProfileConfig | RuntimeProfileImport => Boolean(item));
  const profile = withSummary(Object.assign({}, ...safe.map((item) => isRuntimeProfileImport(item) ? item.profile : item)));
  const settingsJson = safe.find((item): item is RuntimeProfileImport => isRuntimeProfileImport(item) && Boolean(item.settingsJson))?.settingsJson;
  const configToml = safe.find((item): item is RuntimeProfileImport => isRuntimeProfileImport(item) && Boolean(item.configToml))?.configToml;
  return { profile, settingsJson, configToml };
}

function isRuntimeProfileImport(item: RuntimeProfileConfig | RuntimeProfileImport): item is RuntimeProfileImport {
  return "profile" in item || "settingsJson" in item || "configToml" in item;
}

function withSummary(profile: RuntimeProfileConfig): RuntimeProfileConfig | undefined {
  const summary = [
    profile.settingsRef ? "Claude settings" : "",
    profile.configRef ? "Codex config" : "",
    profile.model ? `model ${profile.model}` : "",
    profile.modelReasoningEffort ? `thinking ${profile.modelReasoningEffort}` : "",
    profile.permissionMode ? `mode ${profile.permissionMode}` : "",
    profile.sandbox ? `sandbox ${profile.sandbox}` : "",
    profile.approval ? `approval ${profile.approval}` : "",
    profile.allowedTools?.length ? `${profile.allowedTools.length} allowed tools` : "",
    profile.disallowedTools?.length ? `${profile.disallowedTools.length} denied tools` : "",
    profile.addDirs?.length ? `${profile.addDirs.length} add dirs` : ""
  ].filter(Boolean);
  return summary.length ? { ...profile, summary } : undefined;
}

function pushList(args: string[], flag: string, values?: string[]): void {
  if (values?.length) args.push(flag, values.join(","));
}

function list(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const clean = values.map((item) => text(item).slice(0, 160)).filter(Boolean);
  return clean.length ? clean.slice(0, 50) : undefined;
}

function safeAddDirs(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = normalize(value);
    const portable = cleaned.replace(/\\/g, "/");
    if (!cleaned || cleaned === "." || /^~(?:[\\/]|$)/.test(cleaned)) throw new Error("invalid_add_dir");
    if (portable === "/" || /^[a-z]:\/?$/i.test(portable)) throw new Error("invalid_add_dir");
    if (portable === ".." || portable.startsWith("../") || portable.includes("/../")) throw new Error("invalid_add_dir");
    if (!posix.isAbsolute(portable) && !win32.isAbsolute(cleaned) && !/^[a-z0-9._-][a-z0-9._\/-]*$/i.test(portable)) throw new Error("invalid_add_dir");
    const key = portable.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out.length ? out : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function enumValue(value: unknown, allowed: Set<string>, error: string): string | undefined {
  return enumText(text(value), allowed, error);
}

function enumText(value: string, allowed: Set<string>, error: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/_/g, "-");
  if (!allowed.has(normalized)) throw new Error(error);
  return normalized;
}

function record(value: unknown): Body | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Body : undefined;
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return undefined; }
}

function field(source: Body, ...names: string[]): unknown {
  for (const name of names) if (source[name] !== undefined) return source[name];
  return undefined;
}
