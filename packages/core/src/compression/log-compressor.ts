import { stripAnsi } from "../utils/text.ts";

export type CompressionResult = { text: string; compressed: boolean; compressorName: string };

const SIGNAL = /ERROR|FATAL|FAIL|failed|exception|traceback|panic|timeout|exit code|assert|Expected:|Received:|npm ERR!|error TS\d+|failed to solve|--- FAIL:|\.([jt]s|py|go|rs):\d+/i;
const NOISE = /\b(downloaded|resolved|fetching|progress|installing|extracting|vite transform|npm timing)\b/i;
const TIMESTAMP = /\b20\d\d-\d\d-\d\d[T ][0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?Z?\b/g;
const COMMAND = /^\s*(?:\$|>)?\s*((?:npm|pnpm|yarn|pytest|go test|cargo test|mvn|gradle|dotnet test|vitest|jest|tsc|eslint|docker build)\b.*)$/i;
const APP_FRAME = /(?:packages|src|test|tests|apps)\/[^:\s]+:\d+(?::\d+)?/;
const MAX_EMITTED_LINES = 160;
const HEAD_LINES = 24;
const TAIL_LINES = 48;
const SIGNAL_WINDOW = 5;

export function compressLog(input: string, retrieveId: string): CompressionResult {
  const clean = stripAnsi(input);
  const lines = clean.split(/\r?\n/);
  if (lines.length <= 220 && clean.length < 12000) {
    return { text: clean, compressed: false, compressorName: "log" };
  }
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(HEAD_LINES, lines.length); i++) keep.add(i);
  for (let i = Math.max(0, lines.length - TAIL_LINES); i < lines.length; i++) keep.add(i);
  lines.forEach((line, index) => {
    if (!SIGNAL.test(line)) return;
    for (let i = Math.max(0, index - SIGNAL_WINDOW); i <= Math.min(lines.length - 1, index + SIGNAL_WINDOW); i++) keep.add(i);
  });
  const sorted = budget([...keep].sort((a, b) => a - b), lines);
  const output = [`[molenkopf compressed: kind=log original_lines=${lines.length} kept_lines=${sorted.length} retrieve=${retrieveId}]`];
  output.push(...ciSummary(lines));
  let previous = -1;
  let repeatCount = 0;
  let previousShape = "";
  for (const index of sorted) {
    if (index > previous + 1) {
      flushRepeat(output, repeatCount, retrieveId);
      repeatCount = 0;
      output.push(`[molenkopf omitted: ${index - previous - 1} repetitive lines retrieve=${retrieveId}]`);
    }
    const line = lines[index];
    const shape = normalizeShape(line);
    if (shape === previousShape && !SIGNAL.test(line)) repeatCount++;
    else {
      flushRepeat(output, repeatCount, retrieveId);
      repeatCount = 0;
      if (!NOISE.test(line) || SIGNAL.test(line)) output.push(scrubSensitiveCommandArgs(line));
      else output.push(`[molenkopf omitted: noisy ${shape} retrieve=${retrieveId}]`);
    }
    previousShape = shape;
    previous = index;
  }
  flushRepeat(output, repeatCount, retrieveId);
  const text = output.join("\n");
  return { text, compressed: text.length < clean.length, compressorName: "log" };
}

function budget(indices: number[], lines: string[]): number[] {
  if (indices.length <= MAX_EMITTED_LINES) return indices;
  const signals = indices.filter((index) => SIGNAL.test(lines[index]));
  const head = indices.slice(0, Math.floor(MAX_EMITTED_LINES / 4));
  const tail = indices.slice(-Math.floor(MAX_EMITTED_LINES / 3));
  const fixed = new Set([...head, ...tail]);
  const remaining = Math.max(0, MAX_EMITTED_LINES - fixed.size);
  return [...new Set([...head, ...edgeSlice(signals.filter((index) => !fixed.has(index)), remaining), ...tail])].sort((a, b) => a - b);
}

function edgeSlice(values: number[], max: number): number[] {
  if (values.length <= max) return values;
  const first = Math.floor(max / 2);
  return [...values.slice(0, first), ...values.slice(values.length - (max - first))];
}

function normalizeShape(line: string): string {
  return line.replace(TIMESTAMP, "<timestamp>").replace(/\d+(?:\.\d+)?%?/g, "<n>").replace(/\b[0-9a-f]{8,}\b/gi, "<hex>").trim();
}

function ciSummary(lines: string[]): string[] {
  const failed: string[] = [], assertions: string[] = [], frames: string[] = [], stderr: string[] = [], final: string[] = [];
  let command = "", cwd = "", exitCode = "";
  for (const line of lines) {
    const commandMatch = !command ? COMMAND.exec(line) : undefined;
    if (commandMatch) command = scrubSensitiveCommandArgs(commandMatch[1].trim());
    const cwdMatch = !cwd ? /^\s*(?:cwd|working directory)[:=]\s*(.+)$/i.exec(line) : undefined;
    if (cwdMatch) cwd = cwdMatch[1].trim();
    const exitMatch = /exit code[: ]+(\d+)/i.exec(line);
    if (exitMatch) exitCode = exitMatch[1];
    if (/^\s*(?:FAIL|FAILED|--- FAIL:)\b/i.test(line) || /\bFAILED\b.*::/.test(line)) pushLimited(failed, scrubSensitiveCommandArgs(line.trim()), 12);
    if (/\b(?:AssertionError|Expected|Received|assert|npm ERR!|error TS\d+|failed to solve|panicked at)\b/i.test(line)) pushLimited(assertions, scrubSensitiveCommandArgs(line.trim()), 16);
    if (APP_FRAME.test(line)) pushLimited(frames, scrubSensitiveCommandArgs(line.trim()), 16);
    if (/^\s*(?:stderr|error)[:>]/i.test(line) || /\b(?:npm ERR!|error TS\d+|failed to solve)\b/i.test(line)) pushLimited(stderr, scrubSensitiveCommandArgs(line.trim()), 12);
  }
  for (const line of lines.slice(-40)) if (SIGNAL.test(line) || /\b(?:tests?|summary|passed)\b/i.test(line)) pushLimited(final, scrubSensitiveCommandArgs(line.trim()), 12);
  return [
    command ? `command: ${command}` : "",
    cwd ? `cwd: ${cwd}` : "",
    exitCode ? `exit_code: ${exitCode}` : "",
    section("failed_tests", failed),
    section("assertions", assertions),
    section("app_frames", frames),
    section("stderr_summary", stderr),
    section("final_summary", final)
  ].filter(Boolean);
}

function pushLimited(items: string[], value: string, max: number): void {
  if (value && items.length < max && !items.includes(value)) items.push(value);
}

function section(name: string, lines: string[]): string {
  return lines.length ? `${name}:\n${lines.map((line) => `- ${line}`).join("\n")}` : "";
}

function scrubSensitiveCommandArgs(line: string): string {
  return line
    .replace(/(\s-H\s+["']?(?:Authorization|Cookie|X-Api-Key):\s*)[^"'\n]+(["']?)/gi, "$1[REDACTED_SECRET:cli_arg]$2")
    .replace(/(^|\s)(--?(?:token|api[-_]?key|password|passwd|secret|authorization|auth|cookie|refresh[-_]?token|access[-_]?token))=("[^"]*"|'[^']*'|[^\s]+)/gi, "$1$2=[REDACTED_SECRET:cli_arg]")
    .replace(/(^|\s)(--?(?:token|api[-_]?key|password|passwd|secret|authorization|auth|cookie|refresh[-_]?token|access[-_]?token))\s+("[^"]*"|'[^']*'|[^\s]+)/gi, "$1$2 [REDACTED_SECRET:cli_arg]");
}

function flushRepeat(output: string[], count: number, retrieveId: string): void {
  if (count > 0) output.push(`[molenkopf omitted: ${count} repeated/noisy lines retrieve=${retrieveId}]`);
}
