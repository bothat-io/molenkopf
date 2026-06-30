import type { ProjectGraph } from "./types.ts";

const MAX_CACHE_ENTRIES = 16;
const CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = {
  graph: ProjectGraph;
  expiresAt: number;
  lastUsedAt: number;
};

const cache = new Map<string, Entry>();

export function getProjectGraphCache(scopeKey: string, now = new Date()): ProjectGraph | undefined {
  pruneExpired(now);
  const entry = cache.get(scopeKey);
  if (!entry) return undefined;
  const time = now.getTime();
  if (entry.expiresAt <= time) {
    cache.delete(scopeKey);
    return undefined;
  }
  entry.lastUsedAt = time;
  return entry.graph;
}

export function setProjectGraphCache(scopeKey: string, graph: ProjectGraph, now = new Date()): void {
  pruneExpired(now);
  cache.set(scopeKey, {
    graph,
    expiresAt: now.getTime() + CACHE_TTL_MS,
    lastUsedAt: now.getTime()
  });
  evictLru();
}

export function deleteProjectGraphCache(scopeKey: string): void {
  cache.delete(scopeKey);
}

export function deleteProjectGraphCacheByRoot(rootId: string): void {
  for (const [scope, entry] of cache) if (entry.graph.rootId === rootId) cache.delete(scope);
}

export function clearProjectGraphCache(): void {
  cache.clear();
}

export function projectGraphCacheSize(now = new Date()): number {
  pruneExpired(now);
  return cache.size;
}

function pruneExpired(now: Date): void {
  const time = now.getTime();
  for (const [scope, entry] of cache) if (entry.expiresAt <= time) cache.delete(scope);
}

function evictLru(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    let oldestScope = "";
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [scope, entry] of cache) {
      if (entry.lastUsedAt < oldestTime) {
        oldestScope = scope;
        oldestTime = entry.lastUsedAt;
      }
    }
    if (!oldestScope) return;
    cache.delete(oldestScope);
  }
}
