export type StacktraceCompressionResult = { text: string; compressed: boolean; compressorName: string };

export function compressStacktrace(input: string, retrieveId: string): StacktraceCompressionResult {
  const lines = input.split(/\r?\n/);
  if (lines.length <= 12 && !/node_modules|node:internal|site-packages/.test(input)) {
    return { text: input, compressed: false, compressorName: "stacktrace" };
  }
  const output = [`[molenkopf compressed: kind=stacktrace original_lines=${lines.length} retrieve=${retrieveId}]`];
  let vendor = 0;
  for (const line of lines) {
    if (/node_modules|node:internal|\/vendor\/|site-packages|stdlib/.test(line)) {
      vendor++;
      continue;
    }
    if (vendor) {
      output.push(`[molenkopf omitted: ${vendor} vendor/stdlib frames retrieve=${retrieveId}]`);
      vendor = 0;
    }
    output.push(line);
  }
  if (vendor) output.push(`[molenkopf omitted: ${vendor} vendor/stdlib frames retrieve=${retrieveId}]`);
  return { text: output.join("\n"), compressed: output.length < lines.length + 1, compressorName: "stacktrace" };
}
