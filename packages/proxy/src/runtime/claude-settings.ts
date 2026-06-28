import { existsSync } from "node:fs";

export function safeClaudeSettingsJson(text: string): string | undefined {
  const settings = parseRecord(text);
  if (!settings) return undefined;
  const env = record(settings.env);
  const gitBash = typeof env?.CLAUDE_CODE_GIT_BASH_PATH === "string" ? env.CLAUDE_CODE_GIT_BASH_PATH.trim() : "";
  if (env && gitBash && !existsSync(gitBash)) delete env.CLAUDE_CODE_GIT_BASH_PATH;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function parseRecord(text: string): Record<string, unknown> | undefined {
  try {
    return record(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
