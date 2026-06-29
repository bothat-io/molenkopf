import { byteLength } from "../utils/text.ts";

export type StacktraceCompressionResult = { text: string; compressed: boolean; compressorName: string };

const VENDOR_FRAME =
  /node_modules|node:internal|site-packages|\/vendor\/|\/\.cargo\/registry\/|\/pkg\/mod\/|\.m2\/repository|\.gradle\/caches|\/NuGet\/packages|stdlib/i;
const CAUSE_LINE =
  /\b(?:caused by|direct cause|during handling|aggregateerror|traceback|panic|error|exception|fatal|assertion|failed)\b/i;

export function compressStacktrace(input: string, retrieveId: string): StacktraceCompressionResult {
  const lines = input.split(/\r?\n/);
  const output = [`[molenkopf compressed: kind=stacktrace original_lines=${lines.length} retrieve=${retrieveId}]`];
  let vendorFrames = 0;
  let repeatedFrames = 0;
  let lastKept = "";

  for (const line of lines) {
    if (isVendorFrame(line) && !isCauseLine(line)) {
      flushRepeated(output, repeatedFrames, retrieveId);
      repeatedFrames = 0;
      vendorFrames++;
      continue;
    }

    flushVendor(output, vendorFrames, retrieveId);
    vendorFrames = 0;

    if (line === lastKept && looksLikeFrame(line)) {
      repeatedFrames++;
      continue;
    }

    flushRepeated(output, repeatedFrames, retrieveId);
    repeatedFrames = 0;
    output.push(line);
    lastKept = line;
  }

  flushRepeated(output, repeatedFrames, retrieveId);
  flushVendor(output, vendorFrames, retrieveId);
  const text = output.join("\n");
  if (byteLength(text) >= byteLength(input)) return { text: input, compressed: false, compressorName: "stacktrace" };
  return { text, compressed: true, compressorName: "stacktrace" };
}

function isVendorFrame(line: string): boolean {
  return VENDOR_FRAME.test(line);
}

function isCauseLine(line: string): boolean {
  return CAUSE_LINE.test(line);
}

function looksLikeFrame(line: string): boolean {
  return /\bat\b|\.java:\d+|\.go:\d+|\.rs:\d+|\.py", line \d+|:\d+(?::\d+)?/.test(line);
}

function flushVendor(output: string[], count: number, retrieveId: string): void {
  if (count > 0) output.push(`[molenkopf omitted: ${count} vendor/stdlib frames retrieve=${retrieveId}]`);
}

function flushRepeated(output: string[], count: number, retrieveId: string): void {
  if (count > 0) output.push(`[molenkopf omitted: ${count} repeated frames retrieve=${retrieveId}]`);
}
