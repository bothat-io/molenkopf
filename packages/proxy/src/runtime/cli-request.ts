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
    if (runModel && !hasModelFlag(args)) args.push("--model", runModel);
  }
  if (provider.runtime === "codex") {
    ensureFlag(args, "--ephemeral");
    if (provider.runtimeAuthDir) ensureFlag(args, "--ignore-user-config");
    if (runModel && !hasModelFlag(args)) args.push("-m", runModel);
  }
  return args;
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
