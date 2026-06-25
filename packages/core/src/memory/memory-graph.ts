import type { Concept } from "./memory-extractor.ts";

// A text-derived memory graph: concept nodes (files, symbols, errors) linked by
// co-occurrence within the same agent request. Bounded so it stays a safe,
// renderable summary, not an unbounded log of traffic.

export type MemoryNode = { id: string; label: string; kind: string; count: number; lastSeen?: string };
export type MemoryEdge = { from: string; to: string; count: number };
export type MemoryGraph = { nodes: MemoryNode[]; edges: MemoryEdge[]; updatedAt?: string };

const MAX_NODES = 120;
const MAX_EDGES = 240;
const MAX_COUNT = 99999;

export function createMemoryGraph(): MemoryGraph {
  return { nodes: [], edges: [] };
}

export function recordConcepts(graph: MemoryGraph, concepts: Concept[], timestamp?: string): MemoryGraph {
  const upserted = concepts.filter((concept) => upsert(graph, concept, timestamp));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const present = upserted.filter((concept) => nodeIds.has(concept.id));
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) link(graph, present[i].id, present[j].id);
  }
  if (concepts.length) graph.updatedAt = timestamp ?? graph.updatedAt;
  return graph;
}

function upsert(graph: MemoryGraph, concept: Concept, timestamp = graph.updatedAt): boolean {
  const found = graph.nodes.find((node) => node.id === concept.id);
  if (found) {
    found.count = Math.min(MAX_COUNT, found.count + 1);
    found.lastSeen = timestamp ?? found.lastSeen;
    return true;
  }
  if (graph.nodes.length >= MAX_NODES) evictOne(graph);
  if (graph.nodes.length >= MAX_NODES) return false;
  graph.nodes.push({ id: concept.id, label: concept.label, kind: concept.kind, count: 1, lastSeen: timestamp });
  return true;
}

function evictOne(graph: MemoryGraph) {
  const candidate = [...graph.nodes].sort((a, b) => a.count - b.count || (a.lastSeen ?? "").localeCompare(b.lastSeen ?? "") || a.id.localeCompare(b.id))[0];
  if (!candidate) return;
  graph.nodes = graph.nodes.filter((node) => node.id !== candidate.id);
  graph.edges = graph.edges.filter((edge) => edge.from !== candidate.id && edge.to !== candidate.id);
}

function link(graph: MemoryGraph, a: string, b: string) {
  const [from, to] = a < b ? [a, b] : [b, a];
  const found = graph.edges.find((edge) => edge.from === from && edge.to === to);
  if (found) found.count = Math.min(MAX_COUNT, found.count + 1);
  else if (graph.edges.length < MAX_EDGES) graph.edges.push({ from, to, count: 1 });
}
