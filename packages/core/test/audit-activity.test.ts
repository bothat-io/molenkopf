import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRecentActivity } from "../src/manifest/audit-activity.ts";
import type { AuditManifest } from "../src/manifest/audit-store.ts";

test("recent activity groups repeated requests by client provider endpoint and status class", () => {
  const groups = summarizeRecentActivity([
    manifest("a", "2026-06-22T20:00:00.000Z", 200, "/v1/messages?api_key=secret"),
    manifest("b", "2026-06-22T20:01:00.000Z", 200, "/v1/messages", { saved: 10, items: 1, refs: ["molenkopf://sha256/one"] }),
    manifest("c", "2026-06-22T20:02:00.000Z", 502, "/v1/messages")
  ]);

  assert.equal(groups.length, 2);
  const ok = groups.find((item) => item.status === "2xx")!;
  assert.equal(ok.clientLabel, "Example Admin - win1");
  assert.equal(ok.endpoint, "POST /v1/messages");
  assert.equal(ok.requests, 2);
  assert.equal(ok.unknown, 0);
  assert.equal(ok.savedTokens, 10);
  assert.equal(ok.compressedItems, 1);
  assert.equal(ok.retrievalRefs, 1);
  assert.doesNotMatch(JSON.stringify(groups), /api_key|secret/);
});

test("recent activity tracks unknown outcomes without counting them as errors", () => {
  const groups = summarizeRecentActivity([
    manifest("unknown", "2026-06-22T20:00:00.000Z", undefined, "/v1/messages"),
    manifest("provisional", "2026-06-22T20:01:00.000Z", 102, "/v1/messages"),
    manifest("error", "2026-06-22T20:02:00.000Z", 503, "/v1/messages")
  ]);
  const unknown = groups.filter((item) => item.status === "unknown" || item.status === "1xx");
  assert.equal(unknown.reduce((sum, item) => sum + item.unknown, 0), 2);
  assert.equal(unknown.reduce((sum, item) => sum + item.errors, 0), 0);
  assert.equal(groups.find((item) => item.status === "5xx")?.errors, 1);
});

test("recent activity derives savings only for historical compressed manifests", () => {
  const groups = summarizeRecentActivity([
    manifest("old", "2026-06-22T20:00:00.000Z", 200, "/v1/messages", { original: 1000, compressed: 250, saved: 0, items: 2 }),
    manifest("delta", "2026-06-22T20:01:00.000Z", 200, "/v1/messages", { original: 1000, compressed: 900, saved: 0, items: 0 })
  ]);
  assert.equal(groups[0].savedTokens, 750);
});

test("recent activity keeps API keys and projects separated", () => {
  const groups = summarizeRecentActivity([
    manifest("a", "2026-06-22T20:00:00.000Z", 200, "/v1/messages", { keyId: "key-a", project: "client-a" }),
    manifest("b", "2026-06-22T20:01:00.000Z", 200, "/v1/messages", { keyId: "key-b", project: "client-b" })
  ]);
  assert.deepEqual(groups.map((item) => item.project).sort(), ["client-a", "client-b"]);
  assert.deepEqual(groups.map((item) => item.keyId).sort(), ["key-a", "key-b"]);
});

function manifest(id: string, timestamp: string, statusCode: number | undefined, path: string, options: { original?: number; compressed?: number; saved?: number; items?: number; refs?: string[]; keyId?: string; project?: string } = {}): AuditManifest {
  const original = options.original ?? 100;
  const saved = options.saved ?? 0;
  return {
    requestId: id, timestamp, method: "POST", path, targetHost: "api.anthropic.com", providerId: "claude-import-1",
    client: { id: "user:admin@example.test", label: "Example Admin - win1", source: "api_key", keyId: options.keyId ?? "win1", project: options.project },
    compressedItems: options.items ?? 0,
    estimatedOriginalTokens: original,
    estimatedCompressedTokens: options.compressed ?? original - saved,
    estimatedSavedTokens: saved,
    redactedSecrets: 0,
    retrievalIds: options.refs ?? [],
    compressorsUsed: [],
    warnings: [],
    statusCode,
    durationMs: 1
  };
}
