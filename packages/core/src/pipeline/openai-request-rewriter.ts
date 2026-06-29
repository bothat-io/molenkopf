import { addCount, type CompressionReason } from "../compression/compression-decision.ts";
import { compressContext, type CompressionOptions, type ContextCompression } from "../compression/context-compressor.ts";
import { redactSecrets } from "../security/secret-redactor.ts";
import { RetrievalStore } from "../store/retrieval-store.ts";
import { estimateTokens } from "../utils/tokens.ts";
import { byteLength } from "../utils/text.ts";
import { hasLongJsonStringCandidate, replaceJsonStrings, scanJsonStringValues, type JsonStringReplacement } from "./json-string-spans.ts";
import type { AuditContentFingerprint } from "../manifest/audit-fingerprints.ts";
import { addCompressionFingerprint } from "./compression-fingerprints.ts";
import { blockMarker, repeatedBlock, repeatedSpanValues } from "./request-dedupe.ts";

export type RewriteAudit = {
  compressedItems: number;
  estimatedOriginalTokens: number;
  estimatedCompressedTokens: number;
  estimatedSavedTokens: number;
  redactedSecrets: number;
  retrievalIds: string[];
  compressorsUsed: string[];
  warnings: string[];
  compressionCandidates?: number;
  compressionSkipped?: number;
  skipReasons?: Record<string, number>;
  contentKindCounts?: Record<string, number>;
  originalBytes?: number;
  forwardedBytes?: number;
  compressionRatio?: number;
  potentialCompressedItems?: number;
  potentialSavedTokens?: number;
  potentialSavedBytes?: number;
  contentFingerprints?: AuditContentFingerprint[];
  staticPrefixHash?: string;
  toolSchemaHash?: string;
  cacheablePrefixBytes?: number;
  hasTimestampNoise?: boolean;
  hasRandomIdNoise?: boolean;
  toolCount?: number;
  toolSchemaBytes?: number;
  toolSchemaTokens?: number;
};

export type CompressResult = {
  body: string;
  compressedItems: number;
  compressionCandidates: number;
  compressionSkipped: number;
  savedTokens: number;
  redactedSecrets: number;
  retrievalIds: string[];
  compressorsUsed: string[];
  skipReasons: Record<string, number>;
  contentKindCounts: Record<string, number>;
  originalBytes: number;
  forwardedBytes: number;
  compressionRatio: number;
  potentialCompressedItems: number;
  potentialSavedTokens: number;
  potentialSavedBytes: number;
  contentFingerprints: AuditContentFingerprint[];
};
const MIN_JSON_STRING_CHARS = 2000;

export type CompressJsonOptions = CompressionOptions & { compress?: boolean; observe?: boolean; minJsonStringChars?: number; maxBodyBytes?: number; maxCandidatesPerRequest?: number; fingerprintSecret?: string };
type CachedCompression = { result: ContextCompression; blockId?: string; replacementText: string; uses: number; auditRecorded: boolean };

export async function rewriteOpenAiJsonBody(body: string, store: RetrievalStore, requestId?: string, options: { compress?: boolean } = {}): Promise<{ body: string; audit: RewriteAudit }> {
  const redacted = redactSecrets(body);
  const compressed = await compressJsonBody(redacted.text, store, requestId, { compress: options.compress !== false });
  const audit = emptyAudit(body, redacted.redactions.length + compressed.redactedSecrets);
  audit.compressedItems = compressed.compressedItems;
  audit.retrievalIds = compressed.retrievalIds;
  audit.compressorsUsed = compressed.compressorsUsed;
  audit.estimatedCompressedTokens = estimateTokens(compressed.body);
  audit.estimatedSavedTokens = compressed.savedTokens;
  audit.compressionCandidates = compressed.compressionCandidates;
  audit.compressionSkipped = compressed.compressionSkipped;
  audit.skipReasons = compressed.skipReasons;
  audit.contentKindCounts = compressed.contentKindCounts;
  audit.originalBytes = compressed.originalBytes;
  audit.forwardedBytes = compressed.forwardedBytes;
  audit.compressionRatio = compressed.compressionRatio;
  audit.potentialCompressedItems = compressed.potentialCompressedItems;
  audit.potentialSavedTokens = compressed.potentialSavedTokens;
  audit.potentialSavedBytes = compressed.potentialSavedBytes;
  audit.contentFingerprints = compressed.contentFingerprints;
  return { body: compressed.body, audit };
}

// Compression only (no redaction), so the middleware pipeline can run redaction
// and compression as separate, individually-toggleable steps.
export async function compressJsonBody(text: string, store: RetrievalStore, requestId?: string, input: CompressJsonOptions | boolean = {}): Promise<CompressResult> {
  const options = normalizeOptions(input);
  const acc: CompressResult = { body: text, compressedItems: 0, compressionCandidates: 0, compressionSkipped: 0, savedTokens: 0, redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], skipReasons: {}, contentKindCounts: {}, originalBytes: byteLength(text), forwardedBytes: byteLength(text), compressionRatio: 1, potentialCompressedItems: 0, potentialSavedTokens: 0, potentialSavedBytes: 0, contentFingerprints: [] };
  if (!options.compress && !options.observe) return skip(acc, "compressor_disabled");
  if (options.maxBodyBytes !== undefined && acc.originalBytes > options.maxBodyBytes) return skip(acc, "body_too_large");
  const minChars = options.minJsonStringChars ?? MIN_JSON_STRING_CHARS;
  if (!hasLongJsonStringCandidate(text, minChars)) return skip(acc, "no_long_json_string_candidate");
  const spans = scanJsonStringValues(text);
  if (!spans) return skip(acc, "invalid_json_body");
  if (!spans.length) return skip(acc, "no_json_string_spans");
  const replacements: JsonStringReplacement[] = [];
  const repeatedValues = repeatedSpanValues(spans, minChars);
  const requestCache = new Map<string, CachedCompression>();
  let blockSequence = 0;
  let largeSpans = 0;
  for (const span of spans) {
    if (span.value.length < minChars) continue;
    largeSpans++;
    acc.compressionCandidates++;
    if (options.maxCandidatesPerRequest !== undefined && acc.compressedItems + acc.compressionSkipped >= options.maxCandidatesPerRequest) {
      acc.compressionSkipped++;
      addCount(acc.skipReasons, "max_candidates_reached");
      continue;
    }
    let cached = requestCache.get(span.value);
    if (!cached) {
      const result = await compressContext(span.value, store, requestId, options.observe ? { ...options, dryRun: true } : options);
      const blockId = result.compressed && repeatedValues.has(span.value) ? `block-${++blockSequence}` : undefined;
      cached = { result, blockId, replacementText: blockId ? blockMarker(result.text, blockId) : result.text, uses: 0, auditRecorded: false };
      requestCache.set(span.value, cached);
    }
    const result = cached.result;
    acc.redactedSecrets += result.redactedSecrets;
    addCount(acc.contentKindCounts, result.kind);
    addCompressionFingerprint(acc, span.value, result, options);
    if (!result.compressed) {
      acc.compressionSkipped++;
      addCount(acc.skipReasons, result.reason);
      continue;
    }
    cached.uses++;
    const replacementText = cached.uses > 1 && cached.blockId ? repeatedBlock(cached.blockId, result) : cached.replacementText;
    if (options.observe) {
      acc.compressionSkipped++;
      acc.potentialCompressedItems++;
      acc.potentialSavedTokens += Math.max(0, estimateTokens(span.value) - estimateTokens(replacementText));
      acc.potentialSavedBytes += Math.max(0, byteLength(span.value) - byteLength(replacementText));
      addCount(acc.skipReasons, "observe_only");
      continue;
    }
    acc.compressedItems++;
    acc.savedTokens += Math.max(0, estimateTokens(span.value) - estimateTokens(replacementText));
    if (!cached.auditRecorded) {
      if (result.retrievalId) acc.retrievalIds.push(result.retrievalId);
      if (result.compressorName) acc.compressorsUsed.push(result.compressorName);
      cached.auditRecorded = true;
    }
    replacements.push({ start: span.start, end: span.end, value: replacementText });
  }
  if (!largeSpans) addCount(acc.skipReasons, "below_json_string_threshold");
  if (replacements.length) acc.body = replaceJsonStrings(text, replacements);
  return finish(acc);
}

function emptyAudit(body: string, redactedSecrets: number): RewriteAudit {
  return {
    compressedItems: 0,
    estimatedOriginalTokens: estimateTokens(body),
    estimatedCompressedTokens: estimateTokens(body),
    estimatedSavedTokens: 0,
    redactedSecrets,
    retrievalIds: [],
    compressorsUsed: [],
    warnings: [],
    originalBytes: byteLength(body),
    forwardedBytes: byteLength(body),
    compressionRatio: 1,
    potentialCompressedItems: 0,
    potentialSavedTokens: 0,
    potentialSavedBytes: 0,
    contentFingerprints: []
  };
}

function skip(acc: CompressResult, reason: CompressionReason): CompressResult {
  acc.compressionSkipped++;
  addCount(acc.skipReasons, reason);
  return finish(acc);
}

function finish(acc: CompressResult): CompressResult {
  acc.forwardedBytes = byteLength(acc.body);
  acc.compressionRatio = acc.originalBytes > 0 ? Math.round((acc.forwardedBytes / acc.originalBytes) * 10000) / 10000 : 1;
  return acc;
}

function normalizeOptions(input: CompressJsonOptions | boolean): CompressJsonOptions {
  return typeof input === "boolean" ? { compress: input } : { compress: input.compress !== false, ...input };
}
