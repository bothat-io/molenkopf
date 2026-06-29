import type { ContextCompression } from "../compression/context-compressor.ts";
import type { scanJsonStringValues } from "./json-string-spans.ts";

export function repeatedSpanValues(spans: ReturnType<typeof scanJsonStringValues>, minChars: number): Set<string> {
  const counts = new Map<string, number>();
  for (const span of spans ?? []) {
    if (span.value.length >= minChars) counts.set(span.value, (counts.get(span.value) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
}

export function blockMarker(text: string, blockId: string): string {
  return `[molenkopf block: id=${blockId}]\n${text}`;
}

export function repeatedBlock(blockId: string, result: ContextCompression): string {
  return `[molenkopf repeated block: same_content_as=${blockId} kind=${result.kind} original_bytes=${result.metrics.originalBytes} omitted]`;
}
