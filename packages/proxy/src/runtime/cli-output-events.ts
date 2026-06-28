import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";

export type CliOutputEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "step"; label: string };

export type CliOutputCollector = ReturnType<typeof createCliOutputCollector>;

export function createCliOutputCollector(onEvent?: (event: CliOutputEvent) => void) {
  let pending = "", jsonSeen = false, eventJsonSeen = false, streamedText = "", finalText = "";
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
    get streamedText() { return streamedText; }
  };

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = parseJson(trimmed);
    if (!event) return;
    jsonSeen = true;
    if (isEventJson(event)) eventJsonSeen = true;
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

function parseJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function finalOutputText(event: Record<string, unknown>): string {
  return firstText(event.result, event.final, event.finalText, event.output_text, nested(event, "response", "output_text"));
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
    return safeLabel([itemType, text(nested(event, "item", "status"))].filter(Boolean).join(" "));
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
