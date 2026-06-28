import test from "node:test";
import assert from "node:assert/strict";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { handleProjectGraphAction } from "../../plugins/project-graph-plugin/actions.ts";
import { plugin } from "../../plugins/project-graph-plugin/plugin.ts";

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

  const query = await handleProjectGraphAction({ actionId: "graph.query", input: { query: "openai", limit: 5 }, scope: "local-api", teamIds: [] }, runtime);
  assert.ok((query.results as unknown[]).length >= 1);
});

test("project graph safety flags reject filesystem scanning", async () => {
  const runtime = { pluginId: "project-graph-plugin", now: () => new Date("2026-06-28T00:00:00.000Z") };
  const data = await plugin.getData?.({
    canManage: true,
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
