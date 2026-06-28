export function requestedModelFromBody(body: string): string | undefined {
  if (!body.trim()) return undefined;
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    return cleanModel(parsed.model);
  } catch {
    return undefined;
  }
}

function cleanModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^a-z0-9._:@/-]/gi, "_").trim().slice(0, 96);
  return cleaned || undefined;
}
