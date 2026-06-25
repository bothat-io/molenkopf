import type { RuntimeProfileConfig } from "../../../core/src/providers/provider-catalog.ts";

const CODEX_SANDBOX = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_APPROVAL = new Set(["untrusted", "on-failure", "on-request", "never"]);

export function codexConfigSummary(toml: string): RuntimeProfileConfig {
  const values = topLevelValues(toml);
  const bypass = values.get("dangerously_bypass_approvals_and_sandbox") === "true";
  return {
    sandbox: bypass ? "danger-full-access" : enumText(values.get("sandbox_mode") || "", CODEX_SANDBOX, "invalid_sandbox"),
    approval: bypass ? "never" : enumText(values.get("approval_policy") || "", CODEX_APPROVAL, "invalid_approval")
  };
}

function topLevelValues(toml: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) break;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (match) values.set(match[1], cleanValue(match[2]));
  }
  return values;
}

function cleanValue(value: string): string {
  const trimmed = value.replace(/\s+#.*$/, "").trim();
  const quoted = trimmed.match(/^"([^"]*)"$/) || trimmed.match(/^'([^']*)'$/);
  return (quoted?.[1] ?? trimmed).replace(/_/g, "-");
}

function enumText(value: string, allowed: Set<string>, error: string): string | undefined {
  if (!value) return undefined;
  if (!allowed.has(value)) throw new Error(error);
  return value;
}
