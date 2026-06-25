import { truncateValue } from "../utils/text.ts";

export type JsonCompressionResult = { text: string; compressed: boolean; compressorName: string };

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
    const keys = [...new Set(parsed.flatMap((item) => item && typeof item === "object" ? Object.keys(item) : []))];
    const text = [
      `[molenkopf compressed: kind=json original_items=${parsed.length} kept_items=40 omitted_items=${parsed.length - 40} retrieve=${retrieveId}]`,
      `keys: ${keys.join(", ")}`,
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
