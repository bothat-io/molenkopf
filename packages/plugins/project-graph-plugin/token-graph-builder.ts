import { createHash } from "node:crypto";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { computeGraphStats, dedupeEdges, dedupeNodes } from "./graph-builder.ts";
import type { ProjectGraph, ProjectGraphEdge, ProjectGraphNode } from "./types.ts";

export function buildProjectGraphFromTokenContext(manifests: AuditManifest[], now = new Date()): ProjectGraph {
  const nodes: ProjectGraphNode[] = [{ id: "project:token-context", kind: "project", label: "token-context" }];
  const edges: ProjectGraphEdge[] = [];
  const buckets = new Map<string, Bucket>();
  for (const item of manifests.slice(-500)) {
    const project = safeLabel(item.client?.project || "unassigned");
    const key = `${project}\n${item.path}\n${item.providerId || "provider:unknown"}\n${item.client?.id || "client:unknown"}`;
    const bucket = buckets.get(key) ?? {
      project,
      route: safeLabel(item.path),
      provider: safeLabel(item.providerId || "provider:unknown"),
      client: safeLabel(item.client?.label || item.client?.id || "client:unknown"),
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      savedTokens: 0
    };
    bucket.requests++;
    bucket.inputTokens += item.upstreamInputTokens ?? item.estimatedCompressedTokens ?? 0;
    bucket.outputTokens += item.upstreamOutputTokens ?? 0;
    bucket.savedTokens += item.estimatedSavedTokens ?? 0;
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) addBucket(nodes, edges, bucket);
  const graph: ProjectGraph = {
    schemaVersion: 1,
    projectId: "token-context",
    rootId: rootIdFor("token-context"),
    generatedAt: now.toISOString(),
    nodes: dedupeNodes(nodes),
    edges: dedupeEdges(edges),
    stats: {},
    warnings: []
  };
  graph.stats = computeGraphStats(graph);
  graph.stats.requests = [...buckets.values()].reduce((sum, item) => sum + item.requests, 0);
  graph.stats.inputTokens = [...buckets.values()].reduce((sum, item) => sum + item.inputTokens, 0);
  graph.stats.outputTokens = [...buckets.values()].reduce((sum, item) => sum + item.outputTokens, 0);
  return graph;
}

function addBucket(nodes: ProjectGraphNode[], edges: ProjectGraphEdge[], bucket: Bucket): void {
  const projectId = `project:${idPart(bucket.project)}`;
  const routeId = `route:${idPart(bucket.route)}`;
  const providerId = `symbol:provider:${idPart(bucket.provider)}`;
  const clientId = `symbol:client:${idPart(bucket.client)}`;
  nodes.push({ id: projectId, kind: "project", label: bucket.project, metadata: tokenMeta(bucket) });
  nodes.push({ id: routeId, kind: "route", label: bucket.route, path: bucket.route, metadata: tokenMeta(bucket) });
  nodes.push({ id: providerId, kind: "symbol", label: `provider:${bucket.provider}`, symbolName: bucket.provider, metadata: tokenMeta(bucket) });
  nodes.push({ id: clientId, kind: "symbol", label: `client:${bucket.client}`, symbolName: bucket.client, metadata: tokenMeta(bucket) });
  edges.push(edge("project:token-context", projectId, "contains"));
  edges.push(edge(projectId, routeId, "handlesRoute"));
  edges.push(edge(routeId, providerId, "references"));
  edges.push(edge(routeId, clientId, "references"));
}

function edge(from: string, to: string, kind: ProjectGraphEdge["kind"]): ProjectGraphEdge {
  return { id: `${kind}:${from}:${to}`, from, to, kind, weight: 1, evidence: { extractor: "project-graph-plugin", confidence: 0.6 } };
}

function tokenMeta(bucket: Bucket): Record<string, number> {
  return { requests: bucket.requests, inputTokens: bucket.inputTokens, outputTokens: bucket.outputTokens, savedTokens: bucket.savedTokens };
}

function rootIdFor(value: string): string {
  return `root_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function idPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function safeLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "unknown";
}

type Bucket = {
  project: string;
  route: string;
  provider: string;
  client: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
};
