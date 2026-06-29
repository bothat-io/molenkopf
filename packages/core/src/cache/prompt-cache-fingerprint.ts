import { localFingerprint } from "../security/local-fingerprint.ts";
import { stableJson } from "../utils/stable-json.ts";

export type PromptCacheFingerprint = {
  staticPrefixHash: string;
  toolSchemaHash: string;
  cacheablePrefixBytes: number;
  hasTimestampNoise: boolean;
  hasRandomIdNoise: boolean;
};

export function fingerprintCacheInputs(input: unknown, tools: unknown, secret: string): PromptCacheFingerprint {
  const staticPrefix = stablePrefixText(input);
  const toolSchema = stableJson(tools);
  return {
    staticPrefixHash: localFingerprint(staticPrefix, secret),
    toolSchemaHash: localFingerprint(toolSchema, secret),
    cacheablePrefixBytes: Buffer.byteLength(staticPrefix, "utf8"),
    hasTimestampNoise: /\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d/.test(staticPrefix),
    hasRandomIdNoise: /\b(?:req|run|msg|uuid)[_-]?[a-f0-9]{8,}\b/i.test(staticPrefix)
  };
}

function stablePrefixText(input: unknown): string {
  if (input === undefined) return "";
  if (typeof input === "string") return input.slice(0, 24_000);
  if (!Array.isArray(input)) return stableJson(input).slice(0, 24_000);
  return stableJson(input.slice(0, Math.min(4, input.length))).slice(0, 24_000);
}
