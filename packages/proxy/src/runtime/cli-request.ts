import { join } from "node:path";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";

type ParsedRequest = Record<string, unknown> | undefined;

export type CliRequestShape = {
  prompt: string;
  responseModel: string;
  runModel?: string;
};

export function cliRequest(body: string, provider: ProviderConfig): CliRequestShape {
  const parsed = parseBody(body);
  const model = requestModel(parsed, provider);
  return {
    prompt: parsed ? promptFromJson(parsed) || body : body,
    responseModel: model.responseModel,
    runModel: model.runModel
  };
}

export function cliArgs(provider: ProviderConfig, runModel?: string): string[] {
  const args = [...(provider.cliArgs ?? defaultArgs(provider))];
  if (provider.runtime === "claude") {
    ensureFlag(args, "--no-session-persistence");
    setOptionValue(args, "--output-format", "stream-json");
    ensureFlag(args, "--include-partial-messages");
    if (provider.runtimeAuthDir) hardenImportedClaudeArgs(args);
    if (runModel && !hasModelFlag(args)) args.push("--model", runModel);
  }
  if (provider.runtime === "codex") {
    ensureFlag(args, "--ephemeral");
    ensureFlag(args, "--json");
    if (provider.runtimeAuthDir) {
      ensureFlag(args, "--ignore-user-config");
      ensureFlag(args, "--ignore-rules");
      ensureFlag(args, "--skip-git-repo-check");
      setOptionValue(args, "--sandbox", "read-only");
      setOptionValue(args, "--cd", runtimeProviderWorkspace(provider));
    }
    if (runModel && !hasModelFlag(args)) args.push("-m", runModel);
  }
  return args;
}

export function runtimeProviderWorkspace(provider: ProviderConfig): string {
  return join(provider.runtimeAuthDir ?? ".", "workspace");
}

function hardenImportedClaudeArgs(args: string[]): void {
  removeOptions(args, [
    "--settings",
    "--add-dir",
    "--allowedTools",
    "--allowed-tools",
    "--disallowedTools",
    "--disallowed-tools",
    "--permission-mode",
    "--tools"
  ]);
  ensureFlag(args, "--safe-mode");
  setOptionValue(args, "--permission-mode", "plan");
  setOptionEquals(args, "--tools", "");
}

function requestModel(parsed: ParsedRequest, provider: ProviderConfig): { responseModel: string; runModel?: string } {
  const raw = typeof parsed?.model === "string" ? parsed.model.trim() : "";
  const fallback = provider.runtime === "claude" ? "sonnet" : provider.runtime === "codex" ? "gpt-5" : provider.id;
  if (!raw) return { responseModel: fallback };
  return { responseModel: raw, runModel: raw };
}

function defaultArgs(provider: ProviderConfig): string[] {
  return provider.runtime === "codex" ? ["exec"] : ["--print"];
}

function ensureFlag(args: string[], flag: string): void {
  if (!args.includes(flag)) args.push(flag);
}

function setOptionValue(args: string[], flag: string, value: string): void {
  removeOptions(args, [flag]);
  args.push(flag, value);
}

function setOptionEquals(args: string[], flag: string, value: string): void {
  removeOptions(args, [flag]);
  args.push(`${flag}=${value}`);
}

function removeOptions(args: string[], flags: string[]): void {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (flags.some((flag) => args[index].startsWith(`${flag}=`))) {
      args.splice(index, 1);
      continue;
    }
    if (!flags.includes(args[index])) continue;
    let count = 1;
    while (index + count < args.length && !args[index + count].startsWith("-")) count += 1;
    args.splice(index, count);
  }
}

function hasModelFlag(args: string[]): boolean {
  return args.some((arg) => arg === "-m" || arg === "--model" || arg.startsWith("--model="));
}

function parseBody(body: string): ParsedRequest {
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ParsedRequest : undefined;
  } catch {
    return undefined;
  }
}

function promptFromJson(record: Record<string, unknown>): string {
  return collectText(record.input) || collectMessages(record.messages) || collectText(record.prompt);
}

function collectMessages(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => collectText((item as Record<string, unknown>)?.content)).filter(Boolean).join("\n");
}

function collectText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return collectText(record.text ?? record.input_text ?? record.output_text ?? record.content);
}
