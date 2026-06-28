import { normalizeProjectRoot } from "./path-policy.ts";
import { discoverProjectFiles } from "./file-discovery.ts";
import { scanProjectFiles } from "./file-scan.ts";
import { buildProjectGraph } from "./graph-builder.ts";
import { getNeighborhood, listRoutes, searchSymbols } from "./graph-query.ts";
import type { PluginActionContext, PluginJson, PluginRuntimeContext } from "../../core/src/plugins/plugin-api.ts";
import type { ProjectGraph, ProjectGraphSettings } from "./types.ts";

let latestGraph: ProjectGraph | undefined;

export function handleProjectGraphAction(ctx: PluginActionContext, _runtime: PluginRuntimeContext): PluginJson {
  if (ctx.actionId === "scan.preview") return previewScanAction(ctx);
  if (ctx.actionId === "scan.run") return runScanAction(ctx);
  if (ctx.actionId === "graph.query") return queryGraphAction(ctx);
  if (ctx.actionId === "graph.neighborhood") return graphNeighborhoodAction(ctx);
  return { error: "unknown_action" };
}

export function previewScanAction(ctx: PluginActionContext): PluginJson {
  const rootPath = normalizeProjectRoot(ctx.input.rootPath);
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

export function runScanAction(ctx: PluginActionContext): PluginJson {
  const rootPath = normalizeProjectRoot(ctx.input.rootPath);
  const discovery = discoverProjectFiles(rootPath, previewPolicy(ctx.input));
  const graph = buildProjectGraph(scanProjectFiles(discovery.files), { rootId: discovery.rootId });
  graph.warnings.push(...discovery.warnings);
  latestGraph = graph;
  return { graphId: graph.projectId, stats: graph.stats, warnings: graph.warnings };
}

export function queryGraphAction(ctx: PluginActionContext): PluginJson {
  if (!latestGraph) return { results: [], warnings: [{ code: "graph_not_scanned" }] };
  const query = typeof ctx.input.query === "string" ? ctx.input.query : "";
  const limit = typeof ctx.input.limit === "number" ? ctx.input.limit : 20;
  return { results: searchSymbols(latestGraph, query, { limit }) };
}

export function graphNeighborhoodAction(ctx: PluginActionContext): PluginJson {
  if (!latestGraph) return { nodes: [], edges: [], warnings: [{ code: "graph_not_scanned" }] };
  const nodeId = typeof ctx.input.nodeId === "string" ? ctx.input.nodeId : "";
  const depth = typeof ctx.input.depth === "number" ? ctx.input.depth : 1;
  return getNeighborhood(latestGraph, nodeId, depth);
}

export function latestProjectGraph(): ProjectGraph | undefined {
  return latestGraph;
}

export function projectGraphDataView(): PluginJson {
  if (!latestGraph) return { graphSummaries: [], routes: [], topFilesByDegree: [], topSymbolsByDegree: [] };
  return {
    graphSummaries: [{ projectId: latestGraph.projectId, rootId: latestGraph.rootId, generatedAt: latestGraph.generatedAt, stats: latestGraph.stats }],
    routes: listRoutes(latestGraph),
    topFilesByDegree: latestGraph.nodes.filter((node) => node.kind === "file").slice(0, 20),
    topSymbolsByDegree: latestGraph.nodes.filter((node) => node.kind === "symbol").slice(0, 20)
  };
}

function previewPolicy(input: Record<string, unknown>): ProjectGraphSettings {
  const include = Array.isArray(input.includeExtensions) ? input.includeExtensions.filter((item): item is string => typeof item === "string") : [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"];
  const maxFiles = typeof input.maxFiles === "number" ? input.maxFiles : 5000;
  return { includeExtensions: include, excludePatterns: [], maxFiles, maxFileBytes: 524288, maxDepth: 32, followSymlinks: false };
}
