import type { ProjectGraphNode } from "./types.ts";
import { lineNumberAt } from "./text-safety.ts";

export function extractRoutes(path: string, text: string): ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  for (const match of text.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']{1,160})["']/g)) {
    const line = lineNumberAt(text, match.index ?? 0);
    nodes.push({ id: `route:${path}:${match[1]}:${line}`, kind: "route", label: `${match[1].toUpperCase()} ${safeRoutePattern(match[2])}`, path, lineStart: line, lineEnd: line, metadata: { method: match[1].toUpperCase() } });
  }
  for (const match of text.matchAll(/\b(?:path|req\.url)\s*(?:===|startsWith\()\s*["']([^"']{1,160})["']/g)) {
    const line = lineNumberAt(text, match.index ?? 0);
    nodes.push({ id: `route:${path}:url:${line}`, kind: "route", label: safeRoutePattern(match[1]), path, lineStart: line, lineEnd: line });
  }
  return nodes;
}

export function safeRoutePattern(value: string): string {
  return value.replace(/[^\w./:*-]/g, "").slice(0, 160);
}
