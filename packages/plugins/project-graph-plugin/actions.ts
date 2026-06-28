import { getNeighborhood, listEventUsage, listPluginFacts, listRoutes, listStorageUsage, searchGraph } from "./graph-query.ts";
import { deleteProjectGraph, listProjectGraphs, loadLatestProjectGraph } from "./graph-storage.ts";
import { safeProjectGraphEdgeForView, safeProjectGraphNodeForView, safeQueryResultForView } from "./safe-output.ts";
import type { PluginActionContext, PluginJson, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { buildProjectGraphFromTokenContext } from "./token-graph-builder.ts";
import type { ProjectGraph } from "./types.ts";

let latestGraph: ProjectGraph | undefined;

export async function handleProjectGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  if (ctx.actionId === "graph.query") return queryGraphAction(ctx, runtime);
  if (ctx.actionId === "graph.neighborhood") return graphNeighborhoodAction(ctx, runtime);
  if (ctx.actionId === "graph.delete") return deleteGraphAction(ctx, runtime);
  return { error: "unknown_action" };
}

export async function queryGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(runtime);
  if (!graph) return { results: [], warnings: [{ code: "graph_not_derived" }] };
  const query = typeof ctx.input.query === "string" ? ctx.input.query : "";
  const limit = typeof ctx.input.limit === "number" ? ctx.input.limit : 20;
  return { results: safeQueryResultForView(searchGraph(graph, query, { limit })) };
}

export async function graphNeighborhoodAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(runtime);
  if (!graph) return { nodes: [], edges: [], warnings: [{ code: "graph_not_derived" }] };
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

export async function projectGraphDataView(runtime: PluginRuntimeContext, manifests: AuditManifest[] = []): Promise<PluginJson> {
  if (manifests.length) latestGraph = buildProjectGraphFromTokenContext(manifests, runtime.now());
  const graph = await currentGraph(runtime);
  if (!graph) return { graphSummaries: await listProjectGraphs(runtime.dataDir), routes: [], topFilesByDegree: [], topSymbolsByDegree: [] };
  const graphSummaries = await listProjectGraphs(runtime.dataDir);
  const derivedSummary = { rootId: graph.rootId, projectId: graph.projectId, generatedAt: graph.generatedAt, stats: graph.stats, source: "token-context" };
  return {
    graphSummaries: [derivedSummary, ...graphSummaries.filter((item) => item.rootId !== graph.rootId)],
    latestDerivationStatus: "derived",
    latestWarnings: graph.warnings.slice(0, 100),
    routes: safeQueryResultForView(listRoutes(graph)),
    pluginDescriptorFacts: safeQueryResultForView(listPluginFacts(graph)),
    storageUsageFacts: safeQueryResultForView(listStorageUsage(graph)),
    eventUsageFacts: safeQueryResultForView(listEventUsage(graph)),
    topFilesByDegree: rankByDegree(graph, "file").map(safeProjectGraphNodeForView),
    topSymbolsByDegree: rankByDegree(graph, "symbol").map(safeProjectGraphNodeForView)
  };
}

async function currentGraph(runtime: PluginRuntimeContext): Promise<ProjectGraph | undefined> {
  if (latestGraph) return latestGraph;
  latestGraph = await loadLatestProjectGraph(runtime.dataDir);
  return latestGraph;
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
