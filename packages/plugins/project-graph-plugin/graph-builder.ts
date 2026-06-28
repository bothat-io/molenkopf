import type { ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from "./types.ts";

export function dedupeNodes(nodes: ProjectGraphNode[]): ProjectGraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

export function dedupeEdges(edges: ProjectGraphEdge[]): ProjectGraphEdge[] {
  return [...new Map(edges.map((edge) => [edge.id, edge])).values()];
}

export function computeGraphStats(graph: ProjectGraph): Record<string, number> {
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    files: graph.nodes.filter((node) => node.kind === "file").length,
    symbols: graph.nodes.filter((node) => node.kind === "symbol").length,
    routes: graph.nodes.filter((node) => node.kind === "route").length,
    tests: graph.nodes.filter((node) => node.kind === "test").length
  };
}
