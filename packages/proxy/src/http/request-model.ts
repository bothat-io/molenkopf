export type RequestModelMetadata = { model?: string; reasoning?: string };

export function requestModelMetadataFromBody(body: string): RequestModelMetadata {
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      model: cleanToken(parsed.model, 96),
      reasoning: requestedReasoning(parsed)
    };
  } catch {
    return {};
  }
}

function requestedReasoning(parsed: Record<string, unknown>): string | undefined {
  const reasoning = objectValue(parsed.reasoning);
  const thinking = objectValue(parsed.thinking);
  return cleanToken(reasoning?.effort ?? parsed.reasoning_effort ?? thinking?.type ?? parsed.thinking, 32);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function cleanToken(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^a-z0-9._:@/-]/gi, "_").trim().slice(0, limit);
  return cleaned || undefined;
}
