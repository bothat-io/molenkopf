export function stripStringLiterals(text: string): string {
  return text.replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, (match) => match[0] + "[REDACTED]" + match.at(-1));
}

export function stripCommentsForScanner(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function redactScanText(text: string): string {
  return stripStringLiterals(stripCommentsForScanner(text));
}

export function safeSymbolName(value: string): string {
  return value.replace(/[^\w.$#-]/g, "").slice(0, 120);
}

export function safeSignature(value: string): string {
  return stripStringLiterals(value).replace(/\s+/g, " ").trim().slice(0, 500);
}

export function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}
