import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";

export type RequestModelMetadata = { model?: string; reasoning?: string };

export function requestModelMetadataFromBody(body: string, provider?: ProviderConfig): RequestModelMetadata {
  if (!body.trim()) return providerMetadata(provider);
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      model: cleanToken(parsed.model, 96) ?? providerModel(provider),
      reasoning: requestedReasoning(parsed) ?? cleanToken(provider?.runtimeProfile?.modelReasoningEffort, 32)
    };
  } catch {
    return providerMetadata(provider);
  }
}

function providerMetadata(provider: ProviderConfig | undefined): RequestModelMetadata {
  return {
    model: providerModel(provider),
    reasoning: cleanToken(provider?.runtimeProfile?.modelReasoningEffort, 32)
  };
}

function providerModel(provider: ProviderConfig | undefined): string | undefined {
  return cleanToken(provider?.runtimeProfile?.model, 96)
    ?? (provider?.runtime === "claude" ? "sonnet" : provider?.runtime === "codex" ? "gpt-5" : undefined);
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
