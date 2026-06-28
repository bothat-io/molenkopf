import type { FileScanResult, ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from "./types.ts";

export function buildProjectGraph(scanResults: FileScanResult[], context: { rootId: string; projectId?: string; generatedAt?: string }): ProjectGraph {
  const projectId = context.projectId ?? context.rootId;
  const nodes: ProjectGraphNode[] = [{ id: `project:${projectId}`, kind: "project", label: projectId }];
  const edges: ProjectGraphEdge[] = [];
  for (const result of scanResults) {
    const fileId = `file:${result.file.relativePath}`;
    nodes.push({ id: fileId, kind: "file", label: result.file.relativePath.split("/").at(-1) ?? result.file.relativePath, path: result.file.relativePath, language: result.language, metadata: { bytes: result.file.bytes } });
    edges.push(edge(`project:${projectId}`, fileId, "contains", result.file.relativePath));
    for (const node of nodeGroups(result)) {
      nodes.push(node);
      edges.push(edge(fileId, node.id, edgeKindFor(node.kind), result.file.relativePath, node.lineStart));
    }
  }
  const graph = { schemaVersion: 1 as const, projectId, rootId: context.rootId, generatedAt: context.generatedAt ?? new Date().toISOString(), nodes: dedupeNodes(nodes), edges: dedupeEdges(edges), stats: {}, warnings: scanResults.flatMap((item) => item.warnings) };
  graph.stats = computeGraphStats(graph);
  return graph;
}

function nodeGroups(result: FileScanResult): ProjectGraphNode[] {
  return [...result.symbols, ...result.imports, ...result.exports, ...result.routes, ...result.tests, ...result.pluginFacts, ...result.storage, ...result.events];
}

function edgeKindFor(kind: ProjectGraphNode["kind"]): ProjectGraphEdge["kind"] {
  if (kind === "import") return "imports";
  if (kind === "export") return "exports";
  if (kind === "route") return "handlesRoute";
  if (kind === "test") return "tests";
  if (kind === "pluginDescriptor") return "declaresPlugin";
  if (kind === "pluginAction") return "declaresAction";
  if (kind === "storageResource") return "references";
  if (kind === "event") return "references";
  return "defines";
}

function edge(from: string, to: string, kind: ProjectGraphEdge["kind"], path: string, lineStart?: number): ProjectGraphEdge {
  return { id: `${kind}:${from}:${to}`, from, to, kind, weight: 1, evidence: { path, lineStart, lineEnd: lineStart, extractor: "project-graph-plugin", confidence: 0.7 } };
}

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
