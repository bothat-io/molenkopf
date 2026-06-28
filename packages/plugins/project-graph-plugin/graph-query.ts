import type { ProjectGraph, ProjectGraphNode } from "./types.ts";

export function searchSymbols(graph: ProjectGraph, query: string, options: { limit?: number } = {}): ProjectGraphNode[] {
  const needle = query.toLowerCase();
  return graph.nodes.filter((node) => node.kind === "symbol" && node.label.toLowerCase().includes(needle)).slice(0, options.limit ?? 20);
}

export function searchGraph(graph: ProjectGraph, query: string, options: { kind?: ProjectGraphNode["kind"]; limit?: number } = {}): ProjectGraphNode[] {
  const needle = query.toLowerCase();
  return graph.nodes.filter((node) => {
    if (options.kind && node.kind !== options.kind) return false;
    return node.label.toLowerCase().includes(needle)
      || node.path?.toLowerCase().includes(needle)
      || node.symbolName?.toLowerCase().includes(needle);
  }).slice(0, options.limit ?? 20);
}

export function findFile(graph: ProjectGraph, pathOrName: string): ProjectGraphNode | undefined {
  return graph.nodes.find((node) => node.kind === "file" && (node.path === pathOrName || node.label === pathOrName));
}

export function getNode(graph: ProjectGraph, nodeId: string): ProjectGraphNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function getNeighborhood(graph: ProjectGraph, nodeId: string, depth = 1): { nodes: ProjectGraphNode[]; edges: typeof graph.edges } {
  const seen = new Set([nodeId]);
  let frontier = new Set([nodeId]);
  const edges = [];
  for (let step = 0; step < depth; step++) {
    const next = new Set<string>();
    for (const edge of graph.edges) if (frontier.has(edge.from) || frontier.has(edge.to)) {
      edges.push(edge);
      if (!seen.has(edge.from)) next.add(edge.from);
      if (!seen.has(edge.to)) next.add(edge.to);
      seen.add(edge.from);
      seen.add(edge.to);
    }
    frontier = next;
  }
  return { nodes: graph.nodes.filter((node) => seen.has(node.id)), edges };
}

export function listRoutes(graph: ProjectGraph): ProjectGraphNode[] {
  return graph.nodes.filter((node) => node.kind === "route");
}

export function listPluginFacts(graph: ProjectGraph): ProjectGraphNode[] {
  return graph.nodes.filter((node) => node.kind === "pluginDescriptor" || node.kind === "pluginAction");
}

export function listStorageUsage(graph: ProjectGraph): ProjectGraphNode[] {
  return graph.nodes.filter((node) => node.kind === "storageResource");
}

export function listEventUsage(graph: ProjectGraph): ProjectGraphNode[] {
  return graph.nodes.filter((node) => node.kind === "event");
}
