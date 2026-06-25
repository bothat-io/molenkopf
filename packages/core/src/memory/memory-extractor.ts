import { shortHash } from "../utils/hash.ts";

// Derives a small, safe set of memory concepts from the real transferred text:
// file paths, code symbols, and error types. Only short derived tokens are kept
// (never raw prompts). Callers must pass already-redacted text.

export type ConceptKind = "file" | "symbol" | "error";
export type Concept = { id: string; label: string; kind: ConceptKind };

const FILE_RE = /\b[\w./-]{2,60}\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|json|sql|md|yml|yaml|toml|sh)\b/g;
const SYMBOL_RE = /\b(?:function|class|interface|type|def|func|struct)\s+([A-Za-z_][A-Za-z0-9_]{2,40})/g;
const ERROR_RE = /\b([A-Z][A-Za-z0-9_]*(?:Error|Exception))\b/g;

const PER_KIND = 6;
const MAX_CONCEPTS = 8;

export function extractConcepts(text: string): Concept[] {
  if (typeof text !== "string" || text.length < 3) return [];
  const files = collect(text, FILE_RE, 0, "file");
  const symbols = collect(text, SYMBOL_RE, 1, "symbol");
  const errors = collect(text, ERROR_RE, 1, "error");
  const merged: Concept[] = [];
  const seen = new Set<string>();
  for (const concept of [...errors, ...files, ...symbols]) {
    if (seen.has(concept.id)) continue;
    seen.add(concept.id);
    merged.push(concept);
    if (merged.length >= MAX_CONCEPTS) break;
  }
  return merged;
}

function collect(text: string, re: RegExp, group: number, kind: ConceptKind): Concept[] {
  re.lastIndex = 0;
  const out: Concept[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null && out.length < PER_KIND) {
    const raw = (match[group] ?? match[0]).trim();
    const path = kind === "file" ? safePath(raw) : undefined;
    const label = kind === "file" ? path?.split("/").pop() ?? "" : raw;
    if (!label || label.length > 48 || /^[A-Za-z0-9_-]{24,}$/.test(label)) continue;
    const id = kind === "file" ? `file:${path}` : `${kind}:${label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, kind });
  }
  return out;
}

function safePath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
  if (!normalized) return undefined;
  if (normalized.length <= 96 && /^[\w./-]+$/.test(normalized)) return normalized;
  const base = normalized.split("/").pop() ?? "file";
  return `${base.slice(0, 40)}-${shortHash(normalized)}`;
}
