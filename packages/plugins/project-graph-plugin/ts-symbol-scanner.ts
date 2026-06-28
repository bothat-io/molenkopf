import type { ProjectGraphNode } from "./types.ts";
import { lineNumberAt, safeSignature, safeSymbolName } from "./text-safety.ts";

const SYMBOLS: [ProjectGraphNode["kind"], RegExp][] = [
  ["symbol", /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)[^{;]*/g],
  ["symbol", /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)[^{;]*/g],
  ["symbol", /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g],
  ["symbol", /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)[^{;]*/g],
  ["symbol", /\b(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)/g],
  ["symbol", /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g]
];

export function extractTypeScriptSymbols(path: string, text: string): ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  for (const [kind, pattern] of SYMBOLS) for (const match of text.matchAll(pattern)) {
    const name = safeSymbolName(match[1]);
    const line = lineNumberAt(text, match.index ?? 0);
    nodes.push({ id: `symbol:${path}:${name}:${line}`, kind, label: name, path, symbolName: name, lineStart: line, lineEnd: line, safeSignature: safeSignature(match[0]) });
  }
  return nodes;
}
