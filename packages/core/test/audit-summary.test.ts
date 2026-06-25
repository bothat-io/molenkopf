import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAudit } from "../src/manifest/audit-summary.ts";
import type { AuditManifest } from "../src/manifest/audit-store.ts";

test("audit summary aggregates token savings by safe client bucket", () => {
  const manifests: AuditManifest[] = [
    manifest({ requestId: "a", id: "user:operator", label: "user:operator", original: 100, compressed: 40, compressedItems: 1, warnings: ["compressed"] }),
    manifest({ requestId: "b", id: "user:operator", label: "user:operator", original: 80, compressed: 30, path: "/v1/chat/completions?api_key=secret" }),
    manifest({ requestId: "c", id: "api-key:abc", label: "api-key sha256:abc", original: 50, compressed: 50, statusCode: 500, targetHost: "backup.example" })
  ];
  const summary = summarizeAudit(manifests);
  assert.equal(summary.requests, 3);
  assert.equal(summary.originalTokens, 230);
  assert.equal(summary.compressedTokens, 120);
  assert.equal(summary.forwardedTokens, 120);
  assert.equal(summary.savedTokens, 60);
  assert.equal(summary.savedPercent, 26.09);
  assert.equal(summary.errors, 1);
  assert.equal(summary.unknown, 0);
  assert.deepEqual(summary.statusTotals.byClass.map((item) => [item.id, item.count]), [["2xx", 2], ["5xx", 1]]);
  assert.deepEqual(summary.statusTotals.byCode.map((item) => [item.id, item.count]), [["200", 2], ["500", 1]]);
  assert.deepEqual(summary.warningTotals, { requests: 1, warnings: 1 });
  assert.deepEqual(summary.buckets.map((item) => item.id), ["user:operator", "api-key:abc"]);
  assert.equal(summary.buckets[0].savedTokens, 60);
  assert.equal(summary.buckets[0].savedPercent, 33.33);
  assert.deepEqual(summary.providers.map((item) => item.id), ["provider:openai", "provider:backup"]);
  assert.deepEqual(summary.endpoints.map((item) => item.label), ["POST /v1/responses", "POST /v1/chat/completions"]);
  assert.doesNotMatch(JSON.stringify(summary.endpoints), /secret/);
});

test("audit summary returns zero percentages for empty token totals", () => {
  const summary = summarizeAudit([manifest({ requestId: "zero", original: 0, compressed: 0 })]);
  assert.equal(summary.savedPercent, 0);
  assert.equal(summary.buckets[0].savedPercent, 0);
});

test("audit summary derives savings for historical compressed manifests", () => {
  const summary = summarizeAudit([
    manifest({ requestId: "old", original: 1000, compressed: 250, saved: 0, compressedItems: 2 }),
    manifest({ requestId: "delta", original: 1000, compressed: 900, saved: 0, compressedItems: 0 })
  ]);
  assert.equal(summary.savedTokens, 750);
  assert.equal(summary.buckets[0].savedTokens, 750);
});

test("audit summary exposes forwarded tokens without crediting non-compression deltas", () => {
  const summary = summarizeAudit([
    manifest({ requestId: "redacted-only", original: 100, compressed: 80, saved: 20, compressedItems: 0 })
  ]);
  assert.equal(summary.forwardedTokens, 80);
  assert.equal(summary.compressedTokens, 80);
  assert.equal(summary.savedTokens, 0);
});

test("audit summary groups providers by provider id and API keys by key id", () => {
  const summary = summarizeAudit([
    manifest({ requestId: "key-a", id: "user:bob", label: "Bob", keyId: "key_a", project: "project-alpha/a", providerId: "claude-a", targetHost: "api.anthropic.com", original: 20, compressed: 10 }),
    manifest({ requestId: "key-b", id: "user:bob", label: "Bob", keyId: "key_b", project: "project-alpha/b", providerId: "claude-b", targetHost: "api.anthropic.com", original: 30, compressed: 20 })
  ]);
  assert.deepEqual(summary.providers.map((item) => item.id), ["provider:claude-a", "provider:claude-b"]);
  assert.deepEqual(summary.buckets.map((item) => item.id), ["key:key_a:project:project-alpha/a", "key:key_b:project:project-alpha/b"]);
  assert.deepEqual(summary.buckets.map((item) => item.project), ["project-alpha/a", "project-alpha/b"]);
});

test("audit summary does not count unknown or provisional outcomes as OK", () => {
  const summary = summarizeAudit([
    manifest({ requestId: "unknown", statusCode: undefined }),
    manifest({ requestId: "provisional", statusCode: 102 }),
    manifest({ requestId: "redirect", statusCode: 302 }),
    manifest({ requestId: "cancelled", statusCode: 0 }),
    manifest({ requestId: "failed", statusCode: 500 })
  ]);
  assert.equal(summary.requests, 5);
  assert.equal(summary.ok, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.unknown, 3);
  assert.equal(summary.statusTotals.unknown, 3);
  assert.deepEqual(summary.statusTotals.byClass.map((item) => [item.id, item.count]), [["unknown", 2], ["1xx", 1], ["3xx", 1], ["5xx", 1]]);
});

test("audit summary separates historical buckets when key project attribution changes", () => {
  const summary = summarizeAudit([
    manifest({ requestId: "old-project", id: "user:bob", keyId: "shared-key", project: "old", original: 10, compressed: 5 }),
    manifest({ requestId: "new-project", id: "user:bob", keyId: "shared-key", project: "new", original: 20, compressed: 10 })
  ]);
  assert.deepEqual(summary.buckets.map((item) => item.id).sort(), ["key:shared-key:project:new", "key:shared-key:project:old"]);
});

type ManifestOptions = {
  requestId: string;
  id?: string;
  label?: string;
  original?: number;
  compressed?: number;
  saved?: number;
  compressedItems?: number;
  statusCode?: number;
  path?: string;
  targetHost?: string;
  providerId?: string;
  keyId?: string;
  project?: string;
  warnings?: string[];
};

function manifest(options: ManifestOptions): AuditManifest {
  const id = options.id ?? "anonymous";
  const original = options.original ?? 100;
  const compressed = options.compressed ?? 40;
  return {
    requestId: options.requestId, timestamp: "2026-06-16T12:00:00.000Z", method: "POST", path: options.path ?? "/v1/responses", targetHost: options.targetHost ?? "api.openai.com", providerId: options.providerId ?? (options.targetHost === "backup.example" ? "backup" : "openai"),
    client: { id, label: options.label ?? id, source: id.startsWith("user") ? "user" : id.startsWith("api-key") || options.keyId ? "api_key" : "anonymous", keyId: options.keyId, project: options.project },
    compressedItems: options.compressedItems ?? 0, estimatedOriginalTokens: original, estimatedCompressedTokens: compressed, estimatedSavedTokens: options.saved ?? (original - compressed),
    redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: options.warnings ?? [], statusCode: "statusCode" in options ? options.statusCode : 200, durationMs: 1
  };
}
