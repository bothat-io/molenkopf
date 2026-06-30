import { byteLength } from "../utils/text.ts";
import { classifyContent } from "./content-classifier.ts";

export type JsonCompressionResult = { text: string; compressed: boolean; compressorName: string };

const MAX_ARRAY_KEYS = 100;
const ARRAY_EDGE_ITEMS = 8;
const MAX_DEPTH = 4;
const MAX_OBJECT_KEYS = 40;
const MAX_STRING_CHARS = 240;
const MAX_IMPORTANT_ITEMS = 10;
const PROTECTED_TEXT_KEYS = /^(?:content|text|prompt|message|messages|doc|document|documentation|note|notes|markdown|md|diff|patch|code|source|input)$/i;

export function compressJsonText(input: string, retrieveId: string): JsonCompressionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { text: input, compressed: false, compressorName: "json" };
  }
  if (containsProtectedText(parsed)) return { text: input, compressed: false, compressorName: "json" };
  if (Array.isArray(parsed) && parsed.length > 40) {
    return compressedResult(input, summarizeArray(parsed, retrieveId));
  }
  if (input.length < 2000) return { text: input, compressed: false, compressorName: "json" };
  return compressedResult(
    input,
    `[molenkopf compressed: kind=json retrieve=${retrieveId}]\n${JSON.stringify(summarizeValue(parsed, 0), null, 2)}`
  );
}

function summarizeArray(items: unknown[], retrieveId: string): string {
  const first = items.slice(0, ARRAY_EDGE_ITEMS).map((item) => summarizeValue(item, 1));
  const last = items.slice(-ARRAY_EDGE_ITEMS).map((item) => summarizeValue(item, 1));
  const important = importantItems(items).map((item) => summarizeValue(item, 1));
  const keys = arrayKeys(items);
  const statuses = statusCounts(items);
  return [
    `[molenkopf compressed: kind=json original_items=${items.length} kept_edge_items=${ARRAY_EDGE_ITEMS * 2} omitted_items=${Math.max(0, items.length - ARRAY_EDGE_ITEMS * 2)} retrieve=${retrieveId}]`,
    `item_keys: ${keys.items.join(", ")}${keys.omitted ? `, ... omitted_key_entries=${keys.omitted}` : ""}`,
    `key_counts: ${keyCounts(items).join(", ")}`,
    statuses.length ? `status_counts: ${statuses.join(", ")}` : "",
    `important_items_count: ${important.length}`,
    important.length ? "important_items:" : "",
    important.length ? JSON.stringify(important, null, 2) : "",
    "first:",
    JSON.stringify(first, null, 2),
    "last:",
    JSON.stringify(last, null, 2)
  ].filter(Boolean).join("\n");
}

function summarizeValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return truncateString(value);
  if (!value || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) return `[array ${value.length} items truncated at depth ${MAX_DEPTH}]`;
    return `[object ${Object.keys(value).length} keys truncated at depth ${MAX_DEPTH}]`;
  }
  if (Array.isArray(value)) {
    if (value.length <= ARRAY_EDGE_ITEMS * 2) return value.map((item) => summarizeValue(item, depth + 1));
    return {
      __molenkopfType: "array",
      length: value.length,
      first: value.slice(0, ARRAY_EDGE_ITEMS).map((item) => summarizeValue(item, depth + 1)),
      last: value.slice(-ARRAY_EDGE_ITEMS).map((item) => summarizeValue(item, depth + 1))
    };
  }
  return summarizeObject(value as Record<string, unknown>, depth);
}

function summarizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  const entries = Object.entries(value);
  const kept = entries.slice(0, MAX_OBJECT_KEYS).map(([key, item]) => [key, summarizeValue(item, depth + 1)]);
  const out = Object.fromEntries(kept);
  if (entries.length > MAX_OBJECT_KEYS) out.__molenkopfOmittedKeys = entries.length - MAX_OBJECT_KEYS;
  return out;
}

function importantItems(items: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (let i = ARRAY_EDGE_ITEMS; i < items.length - ARRAY_EDGE_ITEMS && out.length < MAX_IMPORTANT_ITEMS; i++) {
    if (isImportantItem(items[i])) out.push(items[i]);
  }
  return out;
}

function isImportantItem(item: unknown): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const values = Object.values(item);
  return values.some((value) => typeof value === "string" && /\b(?:error|failed|failure|fatal|exception|traceback|panic|timeout|assert|warning)\b/i.test(value));
}

function compressedResult(original: string, candidate: string): JsonCompressionResult {
  if (byteLength(candidate) >= byteLength(original)) return { text: original, compressed: false, compressorName: "json" };
  return { text: candidate, compressed: true, compressorName: "json" };
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_CHARS) return value;
  return `${value.slice(0, MAX_STRING_CHARS)}...[truncated ${value.length - MAX_STRING_CHARS} chars]`;
}

function containsProtectedText(value: unknown): boolean {
  const stack: { value: unknown; key?: string; depth: number }[] = [{ value, depth: 0 }];
  while (stack.length) {
    const current = stack.pop()!;
    if (typeof current.value === "string") {
      if (current.value.length >= 400 && protectedText(current.value, current.key)) return true;
      continue;
    }
    if (!current.value || typeof current.value !== "object" || current.depth > 8) continue;
    if (Array.isArray(current.value)) {
      for (let i = current.value.length - 1; i >= 0; i--) stack.push({ value: current.value[i], key: current.key, depth: current.depth + 1 });
      continue;
    }
    const item = current.value as Record<string, unknown>;
    const path = stringValue(item.path) ?? stringValue(item.file) ?? stringValue(item.filename) ?? stringValue(item.name);
    const content = stringValue(item.content) ?? stringValue(item.source) ?? stringValue(item.code) ?? stringValue(item.diff) ?? stringValue(item.patch);
    if (path && content && sourcePath(path) && protectedText(content, "content")) return true;
    for (const [key, entry] of Object.entries(item).reverse()) stack.push({ value: entry, key, depth: current.depth + 1 });
  }
  return false;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sourcePath(value: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|sql|diff|patch|c|cc|cpp|h|hpp|cs|php|swift|kt|kts)$/i.test(value);
}

function protectedText(value: string, key?: string): boolean {
  const kind = classifyContent(value);
  if (kind === "source_code" || kind === "diff" || kind === "markdown") return true;
  return kind === "plain_text" && Boolean(key && PROTECTED_TEXT_KEYS.test(key) && looksLikeProse(value));
}

function looksLikeProse(value: string): boolean {
  const words = value.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? [];
  if (words.length < 20) return false;
  return /[.!?]\s|\n/.test(value);
}

function arrayKeys(items: unknown[]): { items: string[]; omitted: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  let omitted = 0;
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const key of Object.keys(item)) {
      if (seen.has(key)) continue;
      if (out.length >= MAX_ARRAY_KEYS) {
        omitted++;
        continue;
      }
      seen.add(key);
      out.push(key);
    }
  }
  return { items: out, omitted };
}

function keyCounts(items: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const key of Object.keys(item)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, count]) => `${key}=${count}`);
}

function statusCounts(items: unknown[]): string[] {
  const fields = new Set(["status", "state", "result", "level", "severity"]);
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const [key, value] of Object.entries(item)) {
      if (!fields.has(key) || typeof value !== "string" || value.length > 48) continue;
      const label = `${key}.${value.replace(/[^a-z0-9_.:-]+/gi, "_")}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([key, count]) => `${key}=${count}`);
}
