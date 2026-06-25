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
  retrievalId?: string;
  compressorName?: string;
  redactedSecrets: number;
};

// Only structured/operational content is safe to reduce. Prose, markdown,
// source code, and diffs pass through untouched so the model never loses
// meaning it needs (compression is opt-in and must stay non-destructive).
const COMPRESSIBLE = new Set(["json", "stacktrace", "log", "shell_output"]);

export async function compressContext(text: string, store: RetrievalStore, requestId?: string): Promise<ContextCompression> {
  const redacted = redactSecrets(text);
  const safeText = redacted.text;
  const kind = classifyContent(safeText);
  const id = store.idFor(safeText);
  if (!COMPRESSIBLE.has(kind) || safeText.length < 2000) {
    const embedded = safeText.length >= 2000 ? compressOperationalBlocks(safeText, id) : { text: safeText, compressed: false, kind: undefined, compressorName: undefined };
    if (!embedded.compressed || byteLength(embedded.text) >= byteLength(safeText)) return { text: safeText, compressed: false, kind, redactedSecrets: redacted.redactions.length };
    await store.save(safeText, { contentKind: embedded.kind ?? kind, compressedBytes: byteLength(embedded.text), compressorName: embedded.compressorName ?? "embedded", redacted: true, requestId });
    return { text: embedded.text, compressed: true, kind, retrievalId: id, compressorName: embedded.compressorName, redactedSecrets: redacted.redactions.length };
  }
  const result = runCompressor(kind, safeText, id);
  // Never claim compression that did not actually shrink the payload — otherwise
  // we would send a larger body and report negative/zero savings dishonestly.
  // Only persist the original once compression is confirmed beneficial.
  if (!result.compressed || byteLength(result.text) >= byteLength(safeText)) return { text: safeText, compressed: false, kind, redactedSecrets: redacted.redactions.length };
  await store.save(safeText, { contentKind: kind, compressedBytes: byteLength(result.text), compressorName: kind, redacted: true, requestId });
  return { text: result.text, compressed: true, kind, retrievalId: id, compressorName: result.compressorName, redactedSecrets: redacted.redactions.length };
}

function runCompressor(kind: string, text: string, id: string) {
  if (kind === "json") return compressJsonText(text, id);
  if (kind === "stacktrace") return compressStacktrace(text, id);
  return compressLog(text, id);
}
