export type ContentKind =
  | "json" | "stacktrace" | "log" | "shell_output" | "markdown"
  | "source_code" | "diff" | "plain_text" | "unknown";

export function classifyContent(text: string, filename = ""): ContentKind {
  const trimmed = text.trim();
  if (!trimmed) return "plain_text";
  try {
    JSON.parse(trimmed);
    return "json";
  } catch {}
  if (/^diff --git|^@@\s|^\+\+\+ |^--- /m.test(text)) return "diff";
  if (/Traceback|Exception|Error:|^\s+at .+\(.+:\d+:\d+\)|File ".+", line \d+/m.test(text)) return "stacktrace";
  if (/\.(ts|tsx|js|mjs|cjs|json|lock|sql|py|go|rs)$/i.test(filename)) return "source_code";
  if (/\b(import|export|function|class|interface|type)\b|=>|[{;]\s*$/m.test(text)) return "source_code";
  if (/^\s{0,3}#{1,6}\s|^\s*[-*]\s|\|.+\|/m.test(text)) return "markdown";
  if (isShellOutput(text)) return "shell_output";
  const lines = text.split("\n");
  const logHits = lines.filter((line) => /\d{4}-\d{2}-\d{2}|^\[[^\]]+\]\s+(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\b|\b(ERROR|WARN|FATAL)\b/i.test(line)).length;
  const requiredHits = Math.max(1, Math.ceil(lines.length * 0.2));
  const numberedOutputHits = lines.filter((line) => /^line \d+\b/i.test(line)).length;
  if (logHits >= 1 && numberedOutputHits >= Math.ceil(lines.length * 0.5)) return "log";
  if (logHits >= requiredHits) return "log";
  return "plain_text";
}

function isShellOutput(text: string): boolean {
  const command = /^\s*(?:\$|>)?\s*(?:npm|pnpm|yarn|pytest|cargo\s+test|go\s+test|vitest|jest|tsc|eslint|docker\s+build|mvn|gradle|dotnet\s+test)\b/im;
  if (command.test(text)) return true;
  if (/\bexit code\b/i.test(text)) return true;
  const testStatus = /^\s*(?:PASS|FAIL|FAILED)\s+\S+/im.test(text);
  const failureSignal = /\b(?:AssertionError|Traceback|panic|failed tests?|test failed|Error:)\b/i.test(text);
  return testStatus && failureSignal;
}
