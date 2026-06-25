import test from "node:test";
import assert from "node:assert/strict";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { createCommunicationGraph, recordCommunicationGraph } from "../src/http/communication-graph.ts";

test("communication graph records safe request metadata and skips browser noise", () => {
  const graph = createCommunicationGraph();
  recordCommunicationGraph(graph, manifest("/favicon.ico?token=secret", 404));
  recordCommunicationGraph(graph, manifest("/v1/responses?token=secret", 200));

  const text = JSON.stringify(graph);
  assert.match(text, /POST \/v1\/responses/);
  assert.match(text, /api.openai.com/);
  assert.match(text, /agent:codex/);
  assert.doesNotMatch(text, /Local agent traffic|favicon|secret|prompt text|response body/);
});

function manifest(path: string, statusCode: number): AuditManifest {
  return {
    requestId: "req",
    timestamp: "2026-06-16T12:00:00.000Z",
    method: "POST",
    path,
    targetHost: "api.openai.com",
    client: { id: "agent:codex", label: "agent:codex", source: "agent" },
    compressedItems: 0,
    estimatedOriginalTokens: 0,
    estimatedCompressedTokens: 0,
    estimatedSavedTokens: 0,
    redactedSecrets: 0,
    retrievalIds: [],
    compressorsUsed: [],
    warnings: [],
    statusCode,
    durationMs: 1
  };
}
