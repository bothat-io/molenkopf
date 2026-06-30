export type UsageTotals = {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  source?: UsageSource;
};

export type UsageSource = "provider_response" | "cli_event" | "estimated_cli" | "mixed_cli_event_estimate";

const MAX_TOKEN_VALUE = 1_000_000_000;
const MAX_BUFFER_CHARS = 2_000_000;

export function createUsageMeter() {
  let input: number | undefined;
  let output: number | undefined;
  let cached: number | undefined;
  let cacheRead: number | undefined;
  let cacheCreation: number | undefined;
  let reasoning: number | undefined;
  let source: UsageSource | undefined;
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
      const result: UsageTotals = { inputTokens: input, outputTokens: output };
      if (cached !== undefined) result.cachedTokens = cached;
      if (cacheRead !== undefined) result.cacheReadTokens = cacheRead;
      if (cacheCreation !== undefined) result.cacheCreationTokens = cacheCreation;
      if (reasoning !== undefined) result.reasoningTokens = reasoning;
      if (source !== undefined) result.source = source;
      return result;
    }
  };

  function applyUsage(usage: UsageTotals | undefined) {
    if (!usage) return;
    input = maxToken(input, usage?.inputTokens);
    output = maxToken(output, usage?.outputTokens);
    cached = maxToken(cached, usage?.cachedTokens);
    cacheRead = maxToken(cacheRead, usage?.cacheReadTokens);
    cacheCreation = maxToken(cacheCreation, usage?.cacheCreationTokens);
    reasoning = maxToken(reasoning, usage?.reasoningTokens);
    source = usage.source ?? source;
  }
}

function consumeSseEvents(text: string, onEvent: (event: SseEvent) => void): string {
  let start = 0;
  for (;;) {
    const lf = text.indexOf("\n\n", start);
    const crlf = text.indexOf("\r\n\r\n", start);
    const end = lf === -1 ? crlf : crlf === -1 ? lf : Math.min(lf, crlf);
    if (end === -1) break;
    const raw = text.slice(start, end);
    const event = parseSseEvent(raw);
    if (event) onEvent(event);
    start = end + (text.startsWith("\r\n\r\n", end) ? 4 : 2);
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
  if (event.type === "message_start" && isRecord(event.data.message)) return usageFromObject(event.data.message.usage);
  if (event.type === "message_delta") return usageFromObject(event.data.usage);
  if (isRecord(event.data.response)) return usageFromObject(event.data.response.usage);
  return usageFromObject(event.data.usage);
}

function jsonUsage(text: string): UsageTotals | undefined {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? usageFromObject(parsed.usage) : undefined;
  } catch {
    return undefined;
  }
}

export function usageFromObject(value: unknown): UsageTotals | undefined {
  if (!isRecord(value)) return undefined;
  const result: UsageTotals = {};
  assignToken(result, "inputTokens", token(value.input_tokens) ?? token(value.prompt_tokens));
  assignToken(result, "outputTokens", token(value.output_tokens) ?? token(value.completion_tokens));
  assignToken(result, "cachedTokens", nestedToken(value.input_tokens_details, "cached_tokens") ?? nestedToken(value.prompt_tokens_details, "cached_tokens") ?? token(value.cached_input_tokens));
  assignToken(result, "cacheReadTokens", token(value.cache_read_input_tokens));
  assignToken(result, "cacheCreationTokens", token(value.cache_creation_input_tokens));
  assignToken(result, "reasoningTokens", nestedToken(value.output_tokens_details, "reasoning_tokens") ?? nestedToken(value.completion_tokens_details, "reasoning_tokens") ?? token(value.reasoning_output_tokens));
  return hasUsage(result) ? { ...result, source: "provider_response" } : undefined;
}

function assignToken(target: UsageTotals, key: keyof UsageTotals, value: number | undefined): void {
  if (value !== undefined) (target as Record<string, unknown>)[key] = value;
}

function hasUsage(value: UsageTotals): boolean {
  return value.inputTokens !== undefined
    || value.outputTokens !== undefined
    || value.cachedTokens !== undefined
    || value.cacheReadTokens !== undefined
    || value.cacheCreationTokens !== undefined
    || value.reasoningTokens !== undefined;
}

function nestedToken(value: unknown, key: string): number | undefined {
  return isRecord(value) ? token(value[key]) : undefined;
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
