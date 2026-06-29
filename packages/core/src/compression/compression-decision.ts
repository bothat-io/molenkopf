import { estimateTokens } from "../utils/tokens.ts";
import { byteLength } from "../utils/text.ts";

export type CompressionStatus = "compressed" | "skipped" | "failed";

export type CompressionReason =
  | "savings_confirmed"
  | "compressor_disabled"
  | "body_too_large"
  | "invalid_json_body"
  | "no_long_json_string_candidate"
  | "no_json_string_spans"
  | "below_json_string_threshold"
  | "below_content_threshold"
  | "source_code_not_compressed"
  | "diff_not_compressed"
  | "markdown_not_compressed"
  | "content_kind_not_compressible"
  | "embedded_block_not_found"
  | "embedded_block_not_compressible"
  | "compression_not_smaller"
  | "below_min_saved_tokens"
  | "below_min_saved_percent"
  | "retrieval_store_unavailable"
  | "compressor_error"
  | "max_candidates_reached"
  | "observe_only";

export type CompressionMetrics = {
  originalBytes: number;
  forwardedBytes: number;
  originalTokens: number;
  forwardedTokens: number;
  savedBytes: number;
  savedTokens: number;
};

export type CompressionDecision = {
  status: CompressionStatus;
  reason: CompressionReason;
  kind: string;
  text: string;
  metrics: CompressionMetrics;
  retrievalId?: string;
  compressorName?: string;
  redactedSecrets: number;
};

export function compressionMetrics(originalText: string, forwardedText: string): CompressionMetrics {
  const originalBytes = byteLength(originalText);
  const forwardedBytes = byteLength(forwardedText);
  const originalTokens = estimateTokens(originalText);
  const forwardedTokens = estimateTokens(forwardedText);
  return {
    originalBytes,
    forwardedBytes,
    originalTokens,
    forwardedTokens,
    savedBytes: Math.max(0, originalBytes - forwardedBytes),
    savedTokens: Math.max(0, originalTokens - forwardedTokens)
  };
}

export function addCount(target: Record<string, number>, key: string | undefined, count = 1): void {
  if (!key) return;
  target[key] = (target[key] ?? 0) + Math.max(0, Math.trunc(count));
}
