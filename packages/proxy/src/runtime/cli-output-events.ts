import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";
import { usageFromObject, type UsageTotals } from "../../../core/src/manifest/usage-meter.ts";

export type CliOutputEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "step"; label: string };

export type CliOutputCollector = ReturnType<typeof createCliOutputCollector>;

export function createCliOutputCollector(onEvent?: (event: CliOutputEvent) => void) {
  let pending = "", jsonSeen = false, eventJsonSeen = false, streamedText = "", finalText = "";
  let usage: UsageTotals | undefined;
  return {
    feed(chunk: Buffer) {
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    },
    finish(rawText: string): string {
      if (pending.trim()) handleLine(pending);
      pending = "";
      if (!jsonSeen) return rawText;
      return (streamedText || finalText || (eventJsonSeen ? "" : rawText)).trim();
    },
    get streamedText() { return streamedText; },
    get usage() { return usage; }
  };

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = parseJson(trimmed);
    if (!event) return;
    jsonSeen = true;
    if (isEventJson(event)) eventJsonSeen = true;
    usage = mergeUsage(usage, eventUsage(event));
    const final = finalOutputText(event);
    if (final) {
      finalText = final;
      if (!streamedText) emitText(final);
      return;
    }
    const agentMessage = codexAgentMessageText(event);
    if (agentMessage) emitText(agentMessage, true);
    const delta = deltaText(event);
    if (delta) emitText(delta);
    const step = stepLabel(event);
    if (step) onEvent?.({ kind: "step", label: step });
  }

  function emitText(text: string, block = false): void {
    const output = block && streamedText ? `\n\n${text}` : text;
    streamedText += output;
    onEvent?.({ kind: "text_delta", text: output });
  }
}

function eventUsage(event: Record<string, unknown>): UsageTotals | undefined {
  return mergeUsage(
    mergeUsage(usageFromObject(event.usage), usageFromObject(nested(event, "response", "usage"))),
    mergeUsage(
      usageFromObject(nested(event, "message", "usage")),
      mergeUsage(usageFromObject(nested(event, "item", "usage")), isRecord(event.result) ? usageFromObject(event.result.usage) : undefined)
    )
  );
}

function mergeUsage(left: UsageTotals | undefined, right: UsageTotals | undefined): UsageTotals | undefined {
  if (!left) return right ? { ...right, source: "cli_event" } : undefined;
  if (!right) return left;
  const usage: UsageTotals = { source: "cli_event" };
  assignToken(usage, "inputTokens", maxToken(left.inputTokens, right.inputTokens));
  assignToken(usage, "outputTokens", maxToken(left.outputTokens, right.outputTokens));
  assignToken(usage, "cachedTokens", maxToken(left.cachedTokens, right.cachedTokens));
  assignToken(usage, "cacheReadTokens", maxToken(left.cacheReadTokens, right.cacheReadTokens));
  assignToken(usage, "cacheCreationTokens", maxToken(left.cacheCreationTokens, right.cacheCreationTokens));
  assignToken(usage, "reasoningTokens", maxToken(left.reasoningTokens, right.reasoningTokens));
  return usage;
}

function assignToken(target: UsageTotals, key: keyof UsageTotals, value: number | undefined): void {
  if (value !== undefined) (target as Record<string, unknown>)[key] = value;
}

function maxToken(left: number | undefined, right: number | undefined): number | undefined {
  if (right === undefined) return left;
  return left === undefined || right > left ? right : left;
}

function parseJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function finalOutputText(event: Record<string, unknown>): string {
  return firstText(event.result, nested(event, "result", "output_text"), event.final, event.finalText, event.output_text, nested(event, "response", "output_text"));
}

function deltaText(event: Record<string, unknown>): string {
  const type = text(event.type ?? event.event).toLowerCase();
  return firstText(
    nested(event, "delta", "text"),
    event.delta,
    type.includes("message") || type.includes("text") ? event.text : undefined,
    type.includes("message") ? event.message : undefined,
    contentText(event.content),
    contentText(nested(event, "message", "content"))
  );
}

function stepLabel(event: Record<string, unknown>): string {
  const raw = text(event.type ?? event.event);
  const type = raw.toLowerCase();
  const itemType = text(nested(event, "item", "type"));
  if (type.startsWith("item.") && itemType && itemType !== "agent_message") {
    const status = text(nested(event, "item", "status"));
    const command = itemType === "command_execution" ? safeCommand(text(nested(event, "item", "command"))) : "";
    return safeLabel([itemType, status, command ? `- ${command}` : ""].filter(Boolean).join(" "));
  }
  if (!raw || /(?:delta|message|text|result|completed|complete|created|progress)/.test(type)) return "";
  if (!/(?:tool|exec|command|patch|mcp|task|plan|step|turn|action)/.test(type)) return "";
  const name = firstText(event.name, event.tool_name, event.toolName, nested(event, "tool", "name"), nested(event, "item", "name"));
  return safeLabel(name ? `${raw}: ${name}` : raw);
}

function isEventJson(event: Record<string, unknown>): boolean {
  return typeof event.type === "string" || typeof event.event === "string" || Boolean(nested(event, "item", "type"));
}

function codexAgentMessageText(event: Record<string, unknown>): string {
  if (text(event.type ?? event.event) !== "item.completed") return "";
  if (text(nested(event, "item", "type")) !== "agent_message") return "";
  return firstText(nested(event, "item", "text"), contentText(nested(event, "item", "content")));
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const record = item as Record<string, unknown>;
    return firstText(record.text, record.content, nested(record, "delta", "text"));
  }).filter(Boolean).join("");
}

function nested(record: Record<string, unknown>, ...path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeLabel(value: string): string {
  return redactSecrets(value).text.replace(/\s+/g, " ").trim().slice(0, 160);
}

const SAFE_COMMANDS = new Set(["npm", "pnpm", "yarn", "node", "npx", "vitest", "jest", "pytest", "python", "python3", "go", "cargo", "mvn", "gradle", "dotnet", "tsc", "eslint", "cypress", "git", "make", "cmake", "docker"]);

function safeCommand(value: string): string {
  if (!value) return "";
  const redacted = redactSecrets(value);
  if (redacted.redactions.length) return "";
  const command = redacted.text.replace(/\s+/g, " ").trim();
  const name = command.split(" ")[0]?.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!SAFE_COMMANDS.has(name)) return "";
  return name;
}
