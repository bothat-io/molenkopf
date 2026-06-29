import { localFingerprint } from "../security/local-fingerprint.ts";
import { stableJson } from "../utils/stable-json.ts";

export type ToolSchemaMetrics = {
  toolCount: number;
  schemaBytes: number;
  schemaHash: string;
  estimatedTokens: number;
};

export function measureToolSchemas(tools: unknown, secret: string): ToolSchemaMetrics {
  const normalized = stableJson(tools);
  return {
    toolCount: Array.isArray(tools) ? tools.length : 0,
    schemaBytes: Buffer.byteLength(normalized, "utf8"),
    schemaHash: localFingerprint(normalized, secret),
    estimatedTokens: Math.ceil(normalized.length / 4)
  };
}
