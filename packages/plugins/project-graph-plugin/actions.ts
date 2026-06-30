import { getNeighborhood, listEventUsage, listPluginFacts, listRoutes, listStorageUsage, searchGraph } from "./graph-query.ts";
import { deleteProjectGraph, listProjectGraphs, loadLatestProjectGraph, saveProjectGraph } from "./graph-storage.ts";
import { deleteProjectGraphCache, deleteProjectGraphCacheByRoot, getProjectGraphCache, setProjectGraphCache } from "./graph-cache.ts";
import { safeProjectGraphEdgeForView, safeProjectGraphNodeForView, safeQueryResultForView } from "./safe-output.ts";
import type { PluginActionContext, PluginJson, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { buildProjectGraphFromTokenContext } from "./token-graph-builder.ts";
import type { ProjectGraph } from "./types.ts";

export async function handleProjectGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  if (ctx.actionId === "graph.query") return queryGraphAction(ctx, runtime);
  if (ctx.actionId === "graph.neighborhood") return graphNeighborhoodAction(ctx, runtime);
  if (ctx.actionId === "graph.delete") return deleteGraphAction(ctx, runtime);
  return { error: "unknown_action" };
}

export async function queryGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(ctx, runtime);
  if (!graph) return { results: [], warnings: [{ code: "graph_not_derived" }] };
  const query = typeof ctx.input.query === "string" ? ctx.input.query : "";
  const limit = typeof ctx.input.limit === "number" ? ctx.input.limit : 20;
  return { results: safeQueryResultForView(searchGraph(graph, query, { limit })), freshness: freshnessFor(graph) };
}

export async function graphNeighborhoodAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const graph = await currentGraph(ctx, runtime);
  if (!graph) return { nodes: [], edges: [], warnings: [{ code: "graph_not_derived" }] };
  const nodeId = typeof ctx.input.nodeId === "string" ? ctx.input.nodeId : "";
  const depth = typeof ctx.input.depth === "number" ? ctx.input.depth : 1;
  const neighborhood = getNeighborhood(graph, nodeId, depth);
  return {
    nodes: neighborhood.nodes.map(safeProjectGraphNodeForView),
    edges: neighborhood.edges.map(safeProjectGraphEdgeForView),
    freshness: freshnessFor(graph)
  };
}

export async function deleteGraphAction(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<PluginJson> {
  const rootId = typeof ctx.input.rootId === "string" ? ctx.input.rootId : "";
  if (ctx.input.confirm !== rootId) return { ok: false, error: "confirmation_required" };
  const ok = await deleteProjectGraph(runtime.dataDir, rootId);
  deleteProjectGraphCacheByRoot(rootId);
  return { ok };
}

export function latestProjectGraph(): ProjectGraph | undefined {
  return getProjectGraphCache(scopeKeyFor());
}

export async function projectGraphDataView(runtime: PluginRuntimeContext, manifests: AuditManifest[] = [], scopeKey = scopeKeyFor()): Promise<PluginJson> {
  if (!manifests.length) deleteProjectGraphCache(scopeKey);
  const graph = manifests.length ? await resolveGraph({ manifests, scopeKey, canReadPersisted: false }, runtime) : undefined;
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

async function currentGraph(ctx: PluginActionContext, runtime: PluginRuntimeContext): Promise<ProjectGraph | undefined> {
  const scopeKey = scopeKeyFor(ctx);
  return resolveGraph({ manifests: ctx.manifests ?? [], scopeKey, canReadPersisted: !ctx.userId }, runtime);
}

async function resolveGraph(input: { manifests: AuditManifest[]; scopeKey: string; canReadPersisted: boolean }, runtime: PluginRuntimeContext): Promise<ProjectGraph | undefined> {
  const cached = getProjectGraphCache(input.scopeKey, runtime.now());
  if (cached) return cached;
  if (input.manifests.length) {
    const graph = buildProjectGraphFromTokenContext(input.manifests, runtime.now());
    setProjectGraphCache(input.scopeKey, graph, runtime.now());
    await saveProjectGraph(runtime.dataDir, graph).catch(() => undefined);
    return graph;
  }
  if (!input.canReadPersisted) return undefined;
  const stored = await loadLatestProjectGraph(runtime.dataDir);
  if (stored) setProjectGraphCache(input.scopeKey, stored, runtime.now());
  return stored;
}

function freshnessFor(graph: ProjectGraph): Record<string, unknown> {
  return {
    generatedAt: graph.generatedAt,
    rootId: graph.rootId,
    projectId: graph.projectId,
    source: "token-context",
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length
  };
}

function scopeKeyFor(ctx?: { userId?: string; teamIds?: readonly string[] }): string {
  return ctx?.userId ? `user:${ctx.userId}|teams:${[...(ctx.teamIds ?? [])].sort().join(",")}` : "admin";
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
