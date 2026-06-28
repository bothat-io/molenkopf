import type { ProjectGraphNode } from "./types.ts";
import { lineNumberAt, safeSymbolName } from "./text-safety.ts";

const IMPORTS = [/\bimport\s+(?:type\s+)?[^"']*from\s+["']([^"']+)["']/g, /\brequire\(\s*["']([^"']+)["']\s*\)/g, /\bimport\(\s*["']([^"']+)["']\s*\)/g];
const EXPORTS = [/\bexport\s+(?:class|interface|type|enum|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g, /\bexport\s+\{([^}]+)\}/g, /\bexport\s+[^"']*from\s+["']([^"']+)["']/g];

export function extractImports(path: string, text: string): ProjectGraphNode[] {
  return collect(path, text, IMPORTS, "import", "import-export-scanner");
}

export function extractExports(path: string, text: string): ProjectGraphNode[] {
  return collect(path, text, EXPORTS, "export", "import-export-scanner");
}

function collect(path: string, text: string, patterns: RegExp[], kind: "import" | "export", extractor: string): ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
    const value = kind === "import" ? normalizeImportSpecifier(match[1]) : safeSymbolName(match[1].split(",")[0].trim());
    const line = lineNumberAt(text, match.index ?? 0);
    nodes.push({ id: `${kind}:${path}:${value}:${line}`, kind, label: value, path, lineStart: line, lineEnd: line, metadata: { extractor } });
  }
  return nodes;
}

export function normalizeImportSpecifier(value: string): string {
  return value.replace(/[^\w@./:-]/g, "").slice(0, 240);
}
