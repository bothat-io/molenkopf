export type UsageTotals = { inputTokens?: number; outputTokens?: number };

const MAX_TOKEN_VALUE = 1_000_000_000;
const MAX_BUFFER_CHARS = 2_000_000;

export function createUsageMeter() {
  let input: number | undefined;
  let output: number | undefined;
  let buffer = "";
  let sseBuffer = "";
  return {
    feed(chunk: Buffer | string): void {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      buffer = trimBuffer(buffer + text);
      sseBuffer += text;
      sseBuffer = consumeSseEvents(sseBuffer, (event) => applyUsage(eventUsage(event)));
    },
    result(): UsageTotals {
      applyUsage(jsonUsage(buffer));
      return { inputTokens: input, outputTokens: output };
    }
  };

  function applyUsage(usage: UsageTotals | undefined) {
    input = maxToken(input, usage?.inputTokens);
    output = maxToken(output, usage?.outputTokens);
  }
}

function consumeSseEvents(text: string, onEvent: (event: SseEvent) => void): string {
  let start = 0;
  for (;;) {
    const end = text.indexOf("\n\n", start);
    if (end === -1) break;
    const raw = text.slice(start, end);
    const event = parseSseEvent(raw);
    if (event) onEvent(event);
    start = end + 2;
  }
  return trimBuffer(text.slice(start));
}

type SseEvent = { type?: string; data: unknown };

function parseSseEvent(raw: string): SseEvent | undefined {
  let type: string | undefined;
  const data: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  const body = data.join("\n").trim();
  if (!body || body === "[DONE]") return undefined;
  try {
    return { type, data: JSON.parse(body) };
  } catch {
    return undefined;
  }
}

function eventUsage(event: SseEvent): UsageTotals | undefined {
  if (!isRecord(event.data)) return undefined;
  if (event.type === "message_start" && isRecord(event.data.message)) return usageObject(event.data.message.usage);
  if (event.type === "message_delta") return usageObject(event.data.usage);
  return usageObject(event.data.usage);
}

function jsonUsage(text: string): UsageTotals | undefined {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? usageObject(parsed.usage) : undefined;
  } catch {
    return undefined;
  }
}

function usageObject(value: unknown): UsageTotals | undefined {
  if (!isRecord(value)) return undefined;
  return {
    inputTokens: token(value.input_tokens) ?? token(value.prompt_tokens),
    outputTokens: token(value.output_tokens) ?? token(value.completion_tokens)
  };
}

function token(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TOKEN_VALUE ? value : undefined;
}

function maxToken(current: number | undefined, next: number | undefined): number | undefined {
  if (next === undefined) return current;
  return current === undefined || next > current ? next : current;
}

function trimBuffer(text: string): string {
  return text.length > MAX_BUFFER_CHARS ? text.slice(-MAX_BUFFER_CHARS) : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
