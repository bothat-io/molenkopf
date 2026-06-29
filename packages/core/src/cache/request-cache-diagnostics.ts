import { fingerprintCacheInputs } from "./prompt-cache-fingerprint.ts";
import { measureToolSchemas } from "../tools/tool-schema-metrics.ts";

export type RequestCacheDiagnostics = {
  staticPrefixHash?: string;
  toolSchemaHash?: string;
  cacheablePrefixBytes?: number;
  hasTimestampNoise?: boolean;
  hasRandomIdNoise?: boolean;
  toolCount?: number;
  toolSchemaBytes?: number;
  toolSchemaTokens?: number;
};

export function requestCacheDiagnostics(body: string, secret: string): RequestCacheDiagnostics {
  const parsed = parseBody(body);
  if (!parsed) return {};
  const input = parsed.input ?? parsed.messages;
  const tools = parsed.tools ?? parsed.functions ?? [];
  const hasTools = Array.isArray(tools) ? tools.length > 0 : tools !== undefined && tools !== null;
  if (input === undefined && !hasTools) return {};
  const cache = fingerprintCacheInputs(input, tools, secret);
  const toolMetrics = measureToolSchemas(tools, secret);
  return {
    staticPrefixHash: cache.staticPrefixHash,
    toolSchemaHash: cache.toolSchemaHash,
    cacheablePrefixBytes: cache.cacheablePrefixBytes,
    hasTimestampNoise: cache.hasTimestampNoise,
    hasRandomIdNoise: cache.hasRandomIdNoise,
    toolCount: toolMetrics.toolCount,
    toolSchemaBytes: toolMetrics.schemaBytes,
    toolSchemaTokens: toolMetrics.estimatedTokens
  };
}

function parseBody(body: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}
