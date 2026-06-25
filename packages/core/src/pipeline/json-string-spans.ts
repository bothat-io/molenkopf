export type JsonStringSpan = { start: number; end: number; value: string; key?: string };
export type JsonStringReplacement = { start: number; end: number; value: string };

type Frame = { type: "object"; state: "key" | "colon" | "value" | "comma"; key?: string } | { type: "array"; state: "value" | "comma" };
const MAX_SCAN_DEPTH = 1000;

export function replaceJsonStrings(text: string, replacements: JsonStringReplacement[]): string {
  if (!replacements.length) return text;
  const ordered = [...replacements].sort((a, b) => a.start - b.start);
  let out = "";
  let offset = 0;
  for (const item of ordered) {
    out += text.slice(offset, item.start) + JSON.stringify(item.value);
    offset = item.end;
  }
  return out + text.slice(offset);
}

export function scanJsonStringValues(text: string): JsonStringSpan[] | undefined {
  if (exceedsScanDepth(text)) return [];
  try {
    JSON.parse(text);
  } catch {
    return undefined;
  }
  const spans: JsonStringSpan[] = [];
  const stack: Frame[] = [];
  let i = skipWs(text, 0);
  consumeValue(undefined);
  return spans;

  function consumeValue(key: string | undefined) {
    i = skipWs(text, i);
    const char = text[i];
    if (char === '"') {
      const token = readString(text, i);
      spans.push({ start: i, end: token.end, value: token.value, key });
      i = token.end;
      return;
    }
    if (char === "{") return consumeObject();
    if (char === "[") return consumeArray();
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
  }

  function consumeObject() {
    stack.push({ type: "object", state: "key" });
    i++;
    while (i < text.length) {
      i = skipWs(text, i);
      const frame = stack[stack.length - 1];
      if (!frame || frame.type !== "object") return;
      if (text[i] === "}") {
        stack.pop();
        i++;
        return;
      }
      if (frame.state === "comma") {
        if (text[i] === ",") {
          frame.state = "key";
          i++;
          continue;
        }
        return;
      }
      if (frame.state === "key") {
        const token = readString(text, i);
        frame.key = token.value;
        frame.state = "colon";
        i = token.end;
        continue;
      }
      if (frame.state === "colon") {
        if (text[i] !== ":") return;
        frame.state = "value";
        i++;
        continue;
      }
      consumeValue(frame.key);
      frame.state = "comma";
    }
  }

  function consumeArray() {
    stack.push({ type: "array", state: "value" });
    i++;
    while (i < text.length) {
      i = skipWs(text, i);
      const frame = stack[stack.length - 1];
      if (!frame || frame.type !== "array") return;
      if (text[i] === "]") {
        stack.pop();
        i++;
        return;
      }
      if (frame.state === "comma") {
        if (text[i] === ",") {
          frame.state = "value";
          i++;
          continue;
        }
        return;
      }
      consumeValue(undefined);
      frame.state = "comma";
    }
  }
}

function skipWs(text: string, index: number): number {
  while (index < text.length && /\s/.test(text[index])) index++;
  return index;
}

function readString(text: string, start: number): { value: string; end: number } {
  let end = start + 1;
  while (end < text.length) {
    if (text[end] === '"' && !isEscaped(text, end)) break;
    end++;
  }
  end++;
  return { value: JSON.parse(text.slice(start, end)), end };
}

function isEscaped(text: string, quoteIndex: number): boolean {
  let slashes = 0;
  for (let i = quoteIndex - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function exceedsScanDepth(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && !isEscaped(text, i)) inString = !inString;
    if (inString) continue;
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    if (depth > MAX_SCAN_DEPTH) return true;
  }
  return false;
}
