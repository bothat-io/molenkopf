import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { estimateTokens } from "../../core/src/utils/tokens.ts";
import { observeTokenTraffic } from "../../plugins/token-optimizer-plugin/observations.ts";
import { builtinMiddlewares, runRequestPipeline, type PluginContext } from "../src/http/plugin-pipeline.ts";

test("optimizer quality gate shows confirmed savings for safe coding-agent output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "optimizer-quality-"));
  const originalBody = openAiBody(npmTestOutput());
  try {
    const c = await runRequestPipeline(ctx(originalBody), () => true, { store: new RetrievalStore(dir), fingerprintSecret: "test-secret" }, builtinMiddlewares);
    const manifest = manifestFromContext(c, originalBody);
    const summary = observeTokenTraffic([manifest]);

    assert.equal(c.compressedItems > 0, true);
    assert.equal(c.savedTokens > 0, true);
    assert.equal(c.body.length < originalBody.length, true);
    assert.deepEqual(c.effectivePluginIds, ["context-compressor-plugin"]);
    assert.equal(c.compressorMode, "transform");
    assert.equal(summary.savedTokens > 0, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("optimizer quality gate does not report fake savings for protected coding context", async () => {
  const dir = await mkdtemp(join(tmpdir(), "optimizer-quality-protected-"));
  try {
    const source = Array.from({ length: 220 }, (_, i) => `export function case${i}() { return ${i}; }`).join("\n");
    const diff = `diff --git a/app.ts b/app.ts\n@@ -1,3 +1,220 @@\n${source.replace(/^/gm, "+")}`;
    const sourceResult = await runRequestPipeline(ctx(openAiBody(source), "req_source"), () => true, { store: new RetrievalStore(dir) }, builtinMiddlewares);
    const diffResult = await runRequestPipeline(ctx(openAiBody(diff), "req_diff"), () => true, { store: new RetrievalStore(dir) }, builtinMiddlewares);
    const summary = observeTokenTraffic([
      manifestFromContext(sourceResult, openAiBody(source)),
      manifestFromContext(diffResult, openAiBody(diff))
    ]);

    assert.equal(sourceResult.compressedItems, 0);
    assert.equal(sourceResult.savedTokens, 0);
    assert.equal(sourceResult.skipReasons?.source_code_not_compressed, 1);
    assert.deepEqual(sourceResult.zeroSavingsReasons, ["source_code_not_compressed"]);
    assert.equal(diffResult.compressedItems, 0);
    assert.equal(diffResult.savedTokens, 0);
    assert.equal(diffResult.skipReasons?.diff_not_compressed, 1);
    assert.deepEqual(diffResult.zeroSavingsReasons, ["diff_not_compressed"]);
    assert.equal(summary.savedTokens, 0);
    assert.equal(summary.potentialSavedTokens, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function ctx(body: string, requestId = "req_safe"): PluginContext {
  const c: PluginContext = {
    requestId,
    method: "POST",
    path: "/v1/messages",
    consumerId: "user:operator",
    providerId: "default",
    body,
    settingsFor: () => ({ mode: "transform" }),
    redactedSecrets: 0,
    compressedItems: 0,
    savedTokens: 0,
    retrievalIds: [],
    compressorsUsed: [],
    notes: [],
    usageOf: () => ({ requests: 0, inputTokens: 0, outputTokens: 0 }),
    note(message) { c.notes.push(message); }
  };
  return c;
}

function manifestFromContext(c: PluginContext, originalBody: string): AuditManifest {
  return {
    requestId: c.requestId,
    timestamp: "2026-06-30T00:00:00.000Z",
    method: c.method,
    path: c.path,
    targetHost: "api.test",
    providerId: c.providerId,
    compressedItems: c.compressedItems,
    estimatedOriginalTokens: estimateTokens(originalBody),
    estimatedCompressedTokens: estimateTokens(c.body),
    estimatedSavedTokens: c.savedTokens,
    redactedSecrets: c.redactedSecrets,
    retrievalIds: c.retrievalIds,
    compressorsUsed: c.compressorsUsed,
    warnings: c.notes,
    skipReasons: c.skipReasons,
    contentKindCounts: c.contentKindCounts,
    potentialSavedTokens: c.potentialSavedTokens,
    statusCode: c.block?.status ?? 200
  };
}

function openAiBody(content: string): string {
  return JSON.stringify({ model: "test-model", messages: [{ role: "user", content }] });
}

function npmTestOutput(): string {
  const lines = Array.from({ length: 300 }, (_, i) => `PASS packages/proxy/test/test-${i}.test.ts (${20 + i} ms)`);
  return "$ npm test\n" + lines.join("\n") + "\nFAIL packages/core/test/final.test.ts\nAssertionError: expected true";
}
