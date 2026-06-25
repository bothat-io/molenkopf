import { compressContext } from "../compression/context-compressor.ts";
import { redactSecrets } from "../security/secret-redactor.ts";
import { RetrievalStore } from "../store/retrieval-store.ts";
import { estimateTokens } from "../utils/tokens.ts";
import { replaceJsonStrings, scanJsonStringValues, type JsonStringReplacement } from "./json-string-spans.ts";

export type RewriteAudit = {
  compressedItems: number;
  estimatedOriginalTokens: number;
  estimatedCompressedTokens: number;
  estimatedSavedTokens: number;
  redactedSecrets: number;
  retrievalIds: string[];
  compressorsUsed: string[];
  warnings: string[];
};

export type CompressResult = { body: string; compressedItems: number; savedTokens: number; redactedSecrets: number; retrievalIds: string[]; compressorsUsed: string[] };

export async function rewriteOpenAiJsonBody(body: string, store: RetrievalStore, requestId?: string, options: { compress?: boolean } = {}): Promise<{ body: string; audit: RewriteAudit }> {
  const redacted = redactSecrets(body);
  const compressed = await compressJsonBody(redacted.text, store, requestId, options.compress !== false);
  const audit = emptyAudit(body, redacted.redactions.length + compressed.redactedSecrets);
  audit.compressedItems = compressed.compressedItems;
  audit.retrievalIds = compressed.retrievalIds;
  audit.compressorsUsed = compressed.compressorsUsed;
  audit.estimatedCompressedTokens = estimateTokens(compressed.body);
  audit.estimatedSavedTokens = compressed.savedTokens;
  return { body: compressed.body, audit };
}

// Compression only (no redaction), so the middleware pipeline can run redaction
// and compression as separate, individually-toggleable steps.
export async function compressJsonBody(text: string, store: RetrievalStore, requestId?: string, compress = true): Promise<CompressResult> {
  const acc: CompressResult = { body: text, compressedItems: 0, savedTokens: 0, redactedSecrets: 0, retrievalIds: [], compressorsUsed: [] };
  if (!compress) return acc;
  const spans = scanJsonStringValues(text);
  if (!spans) return acc;
  const replacements: JsonStringReplacement[] = [];
  for (const span of spans) {
    if (span.value.length < 2000) continue;
    const result = await compressContext(span.value, store, requestId);
    acc.redactedSecrets += result.redactedSecrets;
    if (!result.compressed) continue;
    acc.compressedItems++;
    acc.savedTokens += Math.max(0, estimateTokens(span.value) - estimateTokens(result.text));
    if (result.retrievalId) acc.retrievalIds.push(result.retrievalId);
    if (result.compressorName) acc.compressorsUsed.push(result.compressorName);
    replacements.push({ start: span.start, end: span.end, value: result.text });
  }
  if (replacements.length) acc.body = replaceJsonStrings(text, replacements);
  return acc;
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
    warnings: []
  };
}
