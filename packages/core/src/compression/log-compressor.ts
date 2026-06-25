import { stripAnsi } from "../utils/text.ts";

export type CompressionResult = { text: string; compressed: boolean; compressorName: string };

const errorPattern = /ERROR|FATAL|FAIL|failed|exception|traceback|exit code|\.([jt]s|py|go|rs):\d+/i;

export function compressLog(input: string, retrieveId: string): CompressionResult {
  const clean = stripAnsi(input);
  const lines = clean.split(/\r?\n/);
  if (lines.length <= 220 && clean.length < 12000) {
    return { text: clean, compressed: false, compressorName: "log" };
  }
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(80, lines.length); i++) keep.add(i);
  for (let i = Math.max(0, lines.length - 120); i < lines.length; i++) keep.add(i);
  lines.forEach((line, index) => {
    if (!errorPattern.test(line)) return;
    for (let i = Math.max(0, index - 5); i <= Math.min(lines.length - 1, index + 5); i++) keep.add(i);
  });
  const sorted = [...keep].sort((a, b) => a - b);
  const output = [`[molenkopf compressed: kind=log original_lines=${lines.length} kept_lines=${sorted.length} retrieve=${retrieveId}]`];
  let previous = -1;
  for (const index of sorted) {
    if (index > previous + 1) {
      output.push(`[molenkopf omitted: ${index - previous - 1} repetitive lines retrieve=${retrieveId}]`);
    }
    const line = lines[index];
    if (line !== output[output.length - 1]) output.push(line);
    previous = index;
  }
  return { text: output.join("\n"), compressed: true, compressorName: "log" };
}
