import type { ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from "./types.ts";

const MAX_ITEMS = 100;
const MAX_STRING = 500;

export function safeProjectGraphForView(graph: ProjectGraph): Record<string, unknown> {
  return {
    schemaVersion: graph.schemaVersion,
    projectId: safeString(graph.projectId),
    rootId: safeString(graph.rootId),
    generatedAt: safeString(graph.generatedAt),
    stats: graph.stats,
    nodes: graph.nodes.slice(0, MAX_ITEMS).map(safeProjectGraphNodeForView),
    edges: graph.edges.slice(0, MAX_ITEMS).map(safeProjectGraphEdgeForView),
    warnings: graph.warnings.slice(0, MAX_ITEMS),
    hasMoreNodes: graph.nodes.length > MAX_ITEMS,
    hasMoreEdges: graph.edges.length > MAX_ITEMS
  };
}

export function safeProjectGraphNodeForView(node: ProjectGraphNode): Record<string, unknown> {
  return {
    id: safeString(node.id),
    kind: node.kind,
    label: safeString(node.label),
    path: node.path ? safeString(node.path) : undefined,
    language: node.language ? safeString(node.language) : undefined,
    symbolName: node.symbolName ? safeString(node.symbolName) : undefined,
    lineStart: node.lineStart,
    lineEnd: node.lineEnd,
    safeSignature: node.safeSignature ? safeString(node.safeSignature) : undefined,
    metadata: safeMetadata(node.metadata)
  };
}

export function safeProjectGraphEdgeForView(edge: ProjectGraphEdge): Record<string, unknown> {
  return {
    id: safeString(edge.id),
    from: safeString(edge.from),
    to: safeString(edge.to),
    kind: edge.kind,
    weight: edge.weight,
    evidence: edge.evidence ? {
      path: edge.evidence.path ? safeString(edge.evidence.path) : undefined,
      lineStart: edge.evidence.lineStart,
      lineEnd: edge.evidence.lineEnd,
      extractor: safeString(edge.evidence.extractor),
      confidence: edge.evidence.confidence
    } : undefined
  };
}

export function safeQueryResultForView(nodes: ProjectGraphNode[]): Record<string, unknown>[] {
  return nodes.slice(0, MAX_ITEMS).map(safeProjectGraphNodeForView);
}

function safeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [safeString(key), safeMetadataValue(item)]));
}

function safeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(safeMetadataValue);
  return undefined;
}

function safeString(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_STRING);
}
