import { compressionMetrics, type CompressionDecision, type CompressionReason } from "./compression-decision.ts";
import { classifyContent } from "./content-classifier.ts";
import { compressJsonText } from "./json-compressor.ts";
import { compressLog } from "./log-compressor.ts";
import { compressOperationalBlocks } from "./operational-block-compressor.ts";
import { compressStacktrace } from "./stacktrace-compressor.ts";
import { redactSecrets } from "../security/secret-redactor.ts";
import { RetrievalStore } from "../store/retrieval-store.ts";
import { byteLength } from "../utils/text.ts";

export type ContextCompression = {
  text: string;
  compressed: boolean;
  kind: string;
  status: CompressionDecision["status"];
  reason: CompressionReason;
  metrics: CompressionDecision["metrics"];
  retrievalId?: string;
  compressorName?: string;
  redactedSecrets: number;
};

export type CompressionOptions = { minSavedTokens?: number; minSavedPercent?: number; minContentChars?: number; allowedKinds?: readonly string[]; dryRun?: boolean };

// Only structured/operational content is safe to reduce. Prose, markdown,
// source code, and diffs pass through untouched so the model never loses
// meaning it needs (compression is opt-in and must stay non-destructive).
const COMPRESSIBLE = new Set(["json", "stacktrace", "log", "shell_output"]);
const PROTECTED = new Set(["source_code", "diff"]);
const EMBEDDED_ALLOWED = new Set(["markdown", "plain_text", "unknown"]);
const MIN_COMPRESS_CHARS = 2000;

export async function compressContext(text: string, store: RetrievalStore, requestId?: string, options: CompressionOptions = {}): Promise<ContextCompression> {
  const redacted = redactSecrets(text);
  const safeText = redacted.text;
  const kind = classifyContent(safeText);
  if (PROTECTED.has(kind)) return skipped(safeText, kind, kind === "diff" ? "diff_not_compressed" : "source_code_not_compressed", redacted.redactions.length);
  if (safeText.length < (options.minContentChars ?? MIN_COMPRESS_CHARS)) return skipped(safeText, kind, "below_content_threshold", redacted.redactions.length);
  if (COMPRESSIBLE.has(kind) && options.allowedKinds && !options.allowedKinds.includes(kind)) return skipped(safeText, kind, "content_kind_not_compressible", redacted.redactions.length);
  if (!COMPRESSIBLE.has(kind)) {
    if (!EMBEDDED_ALLOWED.has(kind)) return skipped(safeText, kind, "content_kind_not_compressible", redacted.redactions.length);
    const id = store.idFor(safeText);
    const embedded = compressOperationalBlocks(safeText, id, options.allowedKinds);
    if (!embedded.compressed) return skipped(safeText, kind, kind === "plain_text" ? "embedded_block_not_found" : "embedded_block_not_compressible", redacted.redactions.length);
    if (byteLength(embedded.text) >= byteLength(safeText)) return skipped(safeText, kind, "compression_not_smaller", redacted.redactions.length);
    const blocked = savingsGate(safeText, embedded.text, options);
    if (blocked) return skipped(safeText, kind, blocked, redacted.redactions.length);
    if (options.dryRun) return compressed(safeText, embedded.text, kind, undefined, embedded.compressorName, redacted.redactions.length);
    if (!await saveOriginal(store, safeText, embedded.kind ?? kind, byteLength(embedded.text), embedded.compressorName ?? "embedded", requestId)) return skipped(safeText, kind, "retrieval_store_unavailable", redacted.redactions.length);
    return compressed(safeText, embedded.text, kind, id, embedded.compressorName, redacted.redactions.length);
  }
  const id = store.idFor(safeText);
  const result = runCompressor(kind, safeText, id);
  // Never claim compression that did not actually shrink the payload — otherwise
  // we would send a larger body and report negative/zero savings dishonestly.
  // Only persist the original once compression is confirmed beneficial.
  if (!result.compressed || byteLength(result.text) >= byteLength(safeText)) return skipped(safeText, kind, "compression_not_smaller", redacted.redactions.length);
  const blocked = savingsGate(safeText, result.text, options);
  if (blocked) return skipped(safeText, kind, blocked, redacted.redactions.length);
  if (options.dryRun) return compressed(safeText, result.text, kind, undefined, result.compressorName, redacted.redactions.length);
  if (!await saveOriginal(store, safeText, kind, byteLength(result.text), kind, requestId)) return skipped(safeText, kind, "retrieval_store_unavailable", redacted.redactions.length);
  return compressed(safeText, result.text, kind, id, result.compressorName, redacted.redactions.length);
}

function runCompressor(kind: string, text: string, id: string) {
  if (kind === "json") return compressJsonText(text, id);
  if (kind === "stacktrace") return compressStacktrace(text, id);
  return compressLog(text, id);
}

async function saveOriginal(store: RetrievalStore, text: string, contentKind: string, compressedBytes: number, compressorName: string, requestId?: string): Promise<boolean> {
  try {
    await store.save(text, { contentKind, compressedBytes, compressorName, redacted: true, requestId });
    return true;
  } catch {
    return false;
  }
}

function skipped(text: string, kind: string, reason: CompressionReason, redactedSecrets: number): ContextCompression {
  return { text, compressed: false, kind, status: "skipped", reason, metrics: compressionMetrics(text, text), redactedSecrets };
}

function compressed(originalText: string, text: string, kind: string, retrievalId: string | undefined, compressorName: string | undefined, redactedSecrets: number): ContextCompression {
  return { text, compressed: true, kind, status: "compressed", reason: "savings_confirmed", metrics: compressionMetrics(originalText, text), retrievalId, compressorName, redactedSecrets };
}

function savingsGate(originalText: string, compressedText: string, options: CompressionOptions): CompressionReason | undefined {
  const metrics = compressionMetrics(originalText, compressedText);
  if (metrics.savedTokens < Math.max(0, options.minSavedTokens ?? 0)) return "below_min_saved_tokens";
  const savedPercent = metrics.originalBytes > 0 ? (metrics.savedBytes / metrics.originalBytes) * 100 : 0;
  if (savedPercent < Math.max(0, options.minSavedPercent ?? 0)) return "below_min_saved_percent";
  return undefined;
}
