import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";

export type CommunicationNode = { id: string; label: string; kind: string; detail: string; count: number };
export type CommunicationEdge = { from: string; to: string; label: string; count: number };
export type CommunicationGraph = { nodes: CommunicationNode[]; edges: CommunicationEdge[]; updatedAt?: string };

const MAX_GRAPH_NODES = 80;
const MAX_GRAPH_EDGES = 180;
const MAX_ID = 140;
const MAX_TEXT = 96;
const MAX_COUNT = 99999;

export function createCommunicationGraph(): CommunicationGraph {
  return { nodes: [], edges: [] };
}

export function buildCommunicationGraph(manifests: AuditManifest[]): CommunicationGraph {
  const graph = createCommunicationGraph();
  for (const manifest of manifests) recordCommunicationGraph(graph, manifest);
  return graph;
}

export function recordCommunicationGraph(graph: CommunicationGraph, manifest: AuditManifest) {
  const path = safePath(manifest.path);
  if (!path) return;
  const source = safeClient(manifest.client);
  const sourceId = `source:${source.source}:${source.id}`;
  const host = safeHost(manifest.targetHost);
  const method = safeMethod(manifest.method);
  const status = safeStatus(manifest.statusCode);
  const providerId = `provider:${host}`;
  const endpointId = `endpoint:${method}:${path}`;
  const statusId = `status:${status.label}`;

  upsert(graph, sourceId, source.label, source.kind, "captured from proxied traffic");
  upsert(graph, providerId, host, "provider", "active upstream");
  upsert(graph, endpointId, `${method} ${path}`, "request", "path and status only");
  upsert(graph, statusId, `${status.label} responses`, "status", status.detail);
  link(graph, sourceId, endpointId, "sends");
  link(graph, endpointId, providerId, "routes to");
  link(graph, endpointId, statusId, "returns");

  if (manifest.compressedItems > 0 || manifest.retrievalIds.length > 0) {
    upsert(graph, "plugin:compression", "Context compression", "plugin", `${manifest.compressedItems} items`);
    link(graph, endpointId, "plugin:compression", "compresses");
  }
  if (manifest.retrievalIds.length > 0) {
    upsert(graph, "store:retrieval", "Local retrieval store", "store", "retrieval IDs only");
    link(graph, "plugin:compression", "store:retrieval", "stores");
  }
  graph.updatedAt = manifest.timestamp;
}

function safeClient(client: AuditManifest["client"]): { id: string; label: string; source: string; kind: string } {
  if (!client) return { id: "anonymous", label: "unattributed client", source: "anonymous", kind: "agent" };
  const source = client.source === "user" || client.source === "agent" || client.source === "api_key" ? client.source : "anonymous";
  return {
    id: safeGraphId(client.id || client.label || source),
    label: trim(client.label || client.id || source, 80),
    source,
    kind: source === "api_key" ? "metadata" : "agent"
  };
}

function safeGraphId(value: string): string {
  const clean = String(value ?? "anonymous").toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
  return trim(clean || "anonymous", 80);
}

function safePath(path: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(String(path ?? ""), "http://local").pathname;
  } catch {
    return undefined;
  }
  if (pathname === "/" || pathname === "/favicon.ico" || pathname === "/src/App.jsx") return undefined;
  if (pathname.startsWith("/.well-known/") || pathname.startsWith("/__molenkopf/")) return undefined;
  const safe = pathname.split("/").map(safePathSegment).join("/").replace(/\/+/g, "/");
  return safe === "/" ? undefined : trim(safe, MAX_TEXT);
}

function safePathSegment(segment: string): string {
  if (!segment) return "";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return ":value";
  }
  if (/\s/.test(decoded) || /^(?:token|secret|password|credential|prompt|api[-_]?key|key)$/i.test(decoded)) return ":value";
  const clean = decoded.replace(/[^A-Za-z0-9._:-]/g, "-");
  if (!clean || clean.length > 28 || /^[A-Za-z0-9_-]{24,}$/.test(clean)) return ":value";
  return clean;
}

function safeHost(value: string): string {
  try {
    const text = String(value ?? "");
    const host = new URL(text.includes("://") ? text : `http://${text}`).hostname;
    return trim(host || "unknown-host", 80);
  } catch {
    return "unknown-host";
  }
}

function safeMethod(value: string): string {
  const method = String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 12);
  return method || "REQUEST";
}

function safeStatus(statusCode: AuditManifest["statusCode"]): { label: string; detail: string } {
  const code = Number(statusCode);
  if (!Number.isInteger(code) || code < 100 || code > 599) return { label: "unknown", detail: "not captured" };
  return { label: `${Math.floor(code / 100)}xx`, detail: String(code) };
}

function upsert(graph: CommunicationGraph, id: string, label: string, kind: string, detail: string) {
  const found = graph.nodes.find((node) => node.id === id);
  if (found) {
    found.count = Math.min(MAX_COUNT, found.count + 1);
    found.detail = trim(detail, MAX_TEXT);
  } else {
    if (graph.nodes.length >= MAX_GRAPH_NODES) return;
    graph.nodes.push({ id: trim(id, MAX_ID), label: trim(label, 80), kind: trim(kind, 24), detail: trim(detail, MAX_TEXT), count: 1 });
  }
}

function link(graph: CommunicationGraph, from: string, to: string, label: string) {
  if (!graph.nodes.some((node) => node.id === from) || !graph.nodes.some((node) => node.id === to)) return;
  const found = graph.edges.find((edge) => edge.from === from && edge.to === to && edge.label === label);
  if (found) found.count = Math.min(MAX_COUNT, found.count + 1);
  else if (graph.edges.length < MAX_GRAPH_EDGES) graph.edges.push({ from, to, label: trim(label, 48), count: 1 });
}

function trim(value: string, max: number): string {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
