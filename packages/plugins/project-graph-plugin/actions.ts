import { normalizeProjectRoot } from "./path-policy.ts";
import { discoverProjectFiles } from "./file-discovery.ts";
import { scanProjectFiles } from "./file-scan.ts";
import { buildProjectGraph } from "./graph-builder.ts";
import { getNeighborhood, listEventUsage, listPluginFacts, listRoutes, listStorageUsage, searchGraph } from "./graph-query.ts";
import { deleteProjectGraph, listProjectGraphs, loadLatestProjectGraph, saveProjectGraph } from "./graph-storage.ts";
import { safeProjectGraphEdgeForView, safeProjectGraphNodeForView, safeQueryResultForView } from "./safe-output.ts";
import type { PluginActionContext, PluginJson, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import type { ProjectGraph, ProjectGraphSettings } from "./types.ts";

let latestGraph: ProjectGraph | undefined;

export async function handleProjectGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  if (ctx.actionId === "scan.preview") return previewScanAction(ctx);
  if (ctx.actionId === "scan.run") return runScanAction(ctx, runtime);
  if (ctx.actionId === "graph.query") return queryGraphAction(ctx, runtime);
  if (ctx.actionId === "graph.neighborhood") return graphNeighborhoodAction(ctx, runtime);
  if (ctx.actionId === "graph.delete") return deleteGraphAction(ctx, runtime);
  return { error: "unknown_action" };
}

export function previewScanAction(ctx: PluginActionContext): PluginJson {
  const rootPath = safeNormalizeRoot(ctx.input.rootPath);
  if (!rootPath) return { error: "invalid_root" };
  const policy = previewPolicy(ctx.input);
  const result = discoverProjectFiles(rootPath, policy);
  return {
    rootId: result.rootId,
    filesFound: result.files.length,
    filesSkipped: result.skipped,
    deniedPaths: result.deniedPaths,
    warnings: result.warnings,
    estimatedNodes: 1 + result.files.length,
    sampleFiles: result.files.slice(0, 20).map((file) => ({ path: file.relativePath, bytes: file.bytes }))
  };
}

export async function runScanAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const rootPath = safeNormalizeRoot(ctx.input.rootPath);
  if (!rootPath) return { error: "invalid_root" };
  const discovery = discoverProjectFiles(rootPath, previewPolicy(ctx.input));
  const graph = buildProjectGraph(scanProjectFiles(discovery.files), { rootId: discovery.rootId });
  graph.warnings.push(...discovery.warnings);
  latestGraph = graph;
  await saveProjectGraph(runtime.dataDir, graph);
  return { graphId: graph.projectId, rootId: graph.rootId, stats: graph.stats, warnings: graph.warnings };
}

export async function queryGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(runtime);
  if (!graph) return { results: [], warnings: [{ code: "graph_not_scanned" }] };
  const query = typeof ctx.input.query === "string" ? ctx.input.query : "";
  const limit = typeof ctx.input.limit === "number" ? ctx.input.limit : 20;
  return { results: safeQueryResultForView(searchGraph(graph, query, { limit })) };
}

export async function graphNeighborhoodAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(runtime);
  if (!graph) return { nodes: [], edges: [], warnings: [{ code: "graph_not_scanned" }] };
  const nodeId = typeof ctx.input.nodeId === "string" ? ctx.input.nodeId : "";
  const depth = typeof ctx.input.depth === "number" ? ctx.input.depth : 1;
  const neighborhood = getNeighborhood(graph, nodeId, depth);
  return {
    nodes: neighborhood.nodes.map(safeProjectGraphNodeForView),
    edges: neighborhood.edges.map(safeProjectGraphEdgeForView)
  };
}

export async function deleteGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const rootId = typeof ctx.input.rootId === "string" ? ctx.input.rootId : "";
  if (ctx.input.confirm !== rootId) return { ok: false, error: "confirmation_required" };
  const ok = await deleteProjectGraph(runtime.dataDir, rootId);
  if (latestGraph?.rootId === rootId) latestGraph = undefined;
  return { ok };
}

export function latestProjectGraph(): ProjectGraph | undefined {
  return latestGraph;
}

export async function projectGraphDataView(runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(runtime);
  if (!graph) return { graphSummaries: await listProjectGraphs(runtime.dataDir), routes: [], topFilesByDegree: [], topSymbolsByDegree: [] };
  return {
    graphSummaries: await listProjectGraphs(runtime.dataDir),
    latestScanStatus: "scanned",
    latestWarnings: graph.warnings.slice(0, 100),
    routes: safeQueryResultForView(listRoutes(graph)),
    pluginDescriptorFacts: safeQueryResultForView(listPluginFacts(graph)),
    storageUsageFacts: safeQueryResultForView(listStorageUsage(graph)),
    eventUsageFacts: safeQueryResultForView(listEventUsage(graph)),
    topFilesByDegree: rankByDegree(graph, "file").map(safeProjectGraphNodeForView),
    topSymbolsByDegree: rankByDegree(graph, "symbol").map(safeProjectGraphNodeForView)
  };
}

function previewPolicy(input: Record<string, unknown>): ProjectGraphSettings {
  const include = Array.isArray(input.includeExtensions) ? input.includeExtensions.filter((item): item is string => typeof item === "string") : [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"];
  const maxFiles = typeof input.maxFiles === "number" ? input.maxFiles : 5000;
  return { includeExtensions: include, excludePatterns: [], maxFiles, maxFileBytes: 524288, maxDepth: 32, followSymlinks: false };
}

async function currentGraph(runtime: PluginRuntimeContext): Promise<ProjectGraph | undefined> {
  if (latestGraph) return latestGraph;
  latestGraph = await loadLatestProjectGraph(runtime.dataDir);
  return latestGraph;
}

function safeNormalizeRoot(value: unknown): string | undefined {
  try { return normalizeProjectRoot(value); } catch { return undefined; }
}

function rankByDegree(graph: ProjectGraph, kind: "file" | "symbol") {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  return graph.nodes
    .filter((node) => node.kind === kind)
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, 20);
}
