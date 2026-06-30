import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { handleProjectGraphAction } from "../../plugins/project-graph-plugin/actions.ts";
import { clearProjectGraphCache, getProjectGraphCache, projectGraphCacheSize, setProjectGraphCache } from "../../plugins/project-graph-plugin/graph-cache.ts";
import { plugin } from "../../plugins/project-graph-plugin/plugin.ts";
import { buildProjectGraphFromTokenContext } from "../../plugins/project-graph-plugin/token-graph-builder.ts";

afterEach(() => clearProjectGraphCache());

test("project graph does not expose scan actions", async () => {
  const runtime = { pluginId: "project-graph-plugin", now: () => new Date("2026-06-28T00:00:00.000Z") };
  const preview = await handleProjectGraphAction({ actionId: "scan.preview", input: { rootPath: process.cwd() }, scope: "local-api", teamIds: [] }, runtime);
  const scan = await handleProjectGraphAction({ actionId: "scan.run", input: { rootPath: process.cwd() }, scope: "local-api", teamIds: [] }, runtime);
  assert.deepEqual(preview, { error: "unknown_action" });
  assert.deepEqual(scan, { error: "unknown_action" });
});

test("project graph derives nodes from token audit metadata", async () => {
  const runtime = { pluginId: "project-graph-plugin", now: () => new Date("2026-06-28T00:00:00.000Z") };
  const data = await plugin.getData?.({
    canManage: true,
    userId: "admin",
    teamIds: [],
    scope: "local-api",
    plugin: { id: "project-graph-plugin" },
    scopes: ["project-graph"],
    manifests: [
      manifest({ path: "/v1/chat/completions", project: "molenkopf", providerId: "openai", inputTokens: 120, outputTokens: 30 }),
      manifest({ path: "/v1/chat/completions", project: "molenkopf", providerId: "openai", inputTokens: 80, outputTokens: 20 })
    ]
  }, runtime);
  assert.equal(data?.latestDerivationStatus, "derived");
  assert.equal(Object.hasOwn(data ?? {}, "latestScanStatus"), false);
  assert.equal(((data?.graphSummaries as Array<{ stats: Record<string, number> }>)[0]).stats.requests, 2);
  assert.equal((data?.routes as unknown[]).length, 1);

  const query = await handleProjectGraphAction({ actionId: "graph.query", input: { query: "openai", limit: 5 }, userId: "admin", scope: "local-api", teamIds: [] }, runtime);
  assert.ok((query.results as unknown[]).length >= 1);
});

test("project graph actions derive from manifests without prior dashboard data load", async () => {
  const runtime = { pluginId: "project-graph-plugin", now: () => new Date("2026-06-28T00:00:00.000Z") };
  const query = await handleProjectGraphAction({
    actionId: "graph.query",
    input: { query: "openai", limit: 5 },
    userId: "admin",
    scope: "local-api",
    teamIds: [],
    manifests: [manifest({ path: "/v1/chat/completions", project: "molenkopf", providerId: "openai", inputTokens: 120, outputTokens: 30 })]
  }, runtime);
  assert.ok((query.results as unknown[]).length >= 1);
  assert.equal((query.freshness as { source?: string }).source, "token-context");

  const neighborhood = await handleProjectGraphAction({
    actionId: "graph.neighborhood",
    input: { nodeId: "project:token-context", depth: 1 },
    userId: "admin",
    scope: "local-api",
    teamIds: [],
    manifests: [manifest({ path: "/v1/chat/completions", project: "molenkopf", providerId: "openai", inputTokens: 120, outputTokens: 30 })]
  }, runtime);
  assert.ok((neighborhood.nodes as unknown[]).length >= 1);
  assert.equal((neighborhood.freshness as { source?: string }).source, "token-context");
});

test("project graph cache is scoped, expires, and evicts least-recently-used entries", () => {
  const base = new Date("2026-06-28T00:00:00.000Z");
  const graph = buildProjectGraphFromTokenContext([
    manifest({ path: "/v1/chat/completions", project: "molenkopf", providerId: "openai", inputTokens: 120, outputTokens: 30 })
  ], base);
  setProjectGraphCache("user:alice", graph, base);
  assert.equal(getProjectGraphCache("user:bob", base), undefined);
  assert.equal(getProjectGraphCache("user:alice", new Date(base.getTime() + 60_000))?.rootId, graph.rootId);
  assert.equal(getProjectGraphCache("user:alice", new Date(base.getTime() + 301_000)), undefined);

  for (let i = 0; i < 17; i++) setProjectGraphCache(`scope:${i}`, graph, new Date(base.getTime() + i));
  assert.equal(projectGraphCacheSize(base), 16);
  assert.equal(getProjectGraphCache("scope:0", base), undefined);
  assert.equal(getProjectGraphCache("scope:16", base)?.rootId, graph.rootId);
});

test("project graph actions can resolve the latest persisted graph snapshot", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-graph-"));
  const runtime = { pluginId: "project-graph-plugin", dataDir, now: () => new Date("2026-06-28T00:00:00.000Z") };
  try {
    await handleProjectGraphAction({
      actionId: "graph.query",
      input: { query: "openai", limit: 5 },
      scope: "local-api",
      teamIds: [],
      manifests: [manifest({ path: "/v1/chat/completions", project: "molenkopf", providerId: "openai", inputTokens: 120, outputTokens: 30 })]
    }, runtime);
    clearProjectGraphCache();
    const restored = await handleProjectGraphAction({ actionId: "graph.query", input: { query: "openai", limit: 5 }, scope: "local-api", teamIds: [] }, runtime);
    assert.ok((restored.results as unknown[]).length >= 1);
    assert.equal((restored.freshness as { projectId?: string }).projectId, "token-context");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("project graph safety flags reject filesystem scanning", async () => {
  const runtime = { pluginId: "project-graph-plugin", now: () => new Date("2026-06-28T00:00:00.000Z") };
  const data = await plugin.getData?.({
    canManage: true,
    userId: "admin",
    teamIds: [],
    scope: "local-api",
    plugin: { id: "project-graph-plugin" },
    scopes: ["project-graph"],
    manifests: []
  }, runtime);
  assert.deepEqual(data?.safety, {
    storesFullSource: false,
    scansFilesystem: false,
    derivesFromTokenMetadata: true,
    mcpExposure: "disabled"
  });
  assert.equal(data?.latestDerivationStatus, "not_derived");
  assert.deepEqual(data?.routes, []);
  const query = await handleProjectGraphAction({ actionId: "graph.query", input: { query: "openai", limit: 5 }, userId: "admin", scope: "local-api", teamIds: [] }, runtime);
  assert.deepEqual(query, { results: [], warnings: [{ code: "graph_not_derived" }] });
});

function manifest(input: { path: string; project: string; providerId: string; inputTokens: number; outputTokens: number }): AuditManifest {
  return {
    requestId: `${input.project}-${input.inputTokens}`,
    timestamp: "2026-06-28T00:00:00.000Z",
    method: "POST",
    path: input.path,
    targetHost: "api.example.test",
    providerId: input.providerId,
    client: { id: "client-1", label: "codex", source: "agent", project: input.project },
    compressedItems: 0,
    estimatedOriginalTokens: input.inputTokens,
    estimatedCompressedTokens: input.inputTokens,
    estimatedSavedTokens: 0,
    redactedSecrets: 0,
    retrievalIds: [],
    compressorsUsed: [],
    warnings: [],
    statusCode: 200,
    upstreamInputTokens: input.inputTokens,
    upstreamOutputTokens: input.outputTokens
  };
}
