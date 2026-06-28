import type { ProjectGraphNode } from "./types.ts";
import { lineNumberAt, safeSymbolName } from "./text-safety.ts";

export function extractPluginDescriptorFacts(path: string, text: string): ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  const id = text.match(/\bid:\s*["']([a-z0-9-]{1,120})["']/)?.[1];
  if (id && /descriptorVersion\s*:\s*2/.test(text)) nodes.push({ id: `plugin:${id}`, kind: "pluginDescriptor", label: id, path });
  for (const match of text.matchAll(/\bid:\s*["']([a-z0-9.-]{1,120})["']/g)) {
    const line = lineNumberAt(text, match.index ?? 0);
    if (/action/i.test(text.slice(Math.max(0, (match.index ?? 0) - 80), (match.index ?? 0) + 80))) nodes.push({ id: `pluginAction:${path}:${match[1]}:${line}`, kind: "pluginAction", label: safeSymbolName(match[1]), path, lineStart: line, lineEnd: line });
  }
  return nodes;
}

export function extractStorageUsage(path: string, text: string): ProjectGraphNode[] {
  return collect(path, text, /\b(openDb|pluginStorage|writePrivateFile|RetrievalStore|AuditStore|UsageSnapshotStore|DatabaseSync)\b/g, "storageResource");
}

export function extractEventUsage(path: string, text: string): ProjectGraphNode[] {
  return collect(path, text, /\b(bus\.emit|emit|onEvent|subscribe)\b\s*\(?\s*["']?([A-Za-z0-9_.:-]{0,120})/g, "event");
}

function collect(path: string, text: string, pattern: RegExp, kind: "storageResource" | "event"): ProjectGraphNode[] {
  const nodes: ProjectGraphNode[] = [];
  for (const match of text.matchAll(pattern)) {
    const line = lineNumberAt(text, match.index ?? 0);
    const label = safeSymbolName(match[2] || match[1]);
    nodes.push({ id: `${kind}:${path}:${label}:${line}`, kind, label, path, lineStart: line, lineEnd: line });
  }
  return nodes;
}
