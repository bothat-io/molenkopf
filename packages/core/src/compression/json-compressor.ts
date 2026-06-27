import { truncateValue } from "../utils/text.ts";

export type JsonCompressionResult = { text: string; compressed: boolean; compressorName: string };

const MAX_ARRAY_KEYS = 100;

export function compressJsonText(input: string, retrieveId: string): JsonCompressionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { text: input, compressed: false, compressorName: "json" };
  }
  if (Array.isArray(parsed) && parsed.length > 40) {
    const first = parsed.slice(0, 20).map((item) => truncateValue(item));
    const last = parsed.slice(-20).map((item) => truncateValue(item));
    const keys = arrayKeys(parsed);
    const text = [
      `[molenkopf compressed: kind=json original_items=${parsed.length} kept_items=40 omitted_items=${parsed.length - 40} retrieve=${retrieveId}]`,
      `keys: ${keys.items.join(", ")}${keys.omitted ? `, ... omitted_key_entries=${keys.omitted}` : ""}`,
      "first:",
      JSON.stringify(first, null, 2),
      "last:",
      JSON.stringify(last, null, 2)
    ].join("\n");
    return { text, compressed: true, compressorName: "json" };
  }
  if (input.length < 2000) return { text: input, compressed: false, compressorName: "json" };
  const summary = truncateValue(parsed, 320);
  return {
    text: `[molenkopf compressed: kind=json retrieve=${retrieveId}]\n${JSON.stringify(summary, null, 2)}`,
    compressed: true,
    compressorName: "json"
  };
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
