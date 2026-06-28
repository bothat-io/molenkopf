import type { ProjectGraphNode } from "./types.ts";
import { lineNumberAt } from "./text-safety.ts";

export function extractTests(path: string, text: string): ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  for (const match of text.matchAll(/\b(test|it|describe)\(\s*["']([^"']{1,160})["']/g)) {
    const line = lineNumberAt(text, match.index ?? 0);
    nodes.push({ id: `test:${path}:${line}`, kind: "test", label: `${match[1]} ${match[2].slice(0, 120)}`, path, lineStart: line, lineEnd: line });
  }
  return nodes;
}
