import test from "node:test";
import assert from "node:assert/strict";
import { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { runRequestPipeline, type PluginContext, type PluginMiddleware } from "../src/http/plugin-pipeline.ts";

function ctx(body: string): PluginContext {
  const c: PluginContext = {
    requestId: "r1", method: "POST", path: "/v1/messages", consumerId: "user:operator", providerId: "default",
    body, redactedSecrets: 0, compressedItems: 0, savedTokens: 0, retrievalIds: [], compressorsUsed: [], notes: [],
    usageOf: () => ({ requests: 0, inputTokens: 0, outputTokens: 0 }),
    note(m) { c.notes.push(m); }
  };
  return c;
}

test("plugin metric outputs are sanitized before audit persistence", async () => {
  const fakeOpenAiKey = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJK"].join("-");
  const middlewares: PluginMiddleware[] = [{
    id: "metrics",
    run(item) {
      item.skipReasons = { safe_reason: 2, [`raw ${fakeOpenAiKey}`]: Number.POSITIVE_INFINITY };
      item.contentKindCounts = { log: 1, bad: Number.NaN };
      item.contentFingerprints = [{ hash: "not-a-hash", contentKind: "log", originalBytes: 1, estimatedOriginalTokens: 1, compressed: false } as any];
      item.effectivePluginIds = ["context-compressor-plugin", `raw ${fakeOpenAiKey}`];
      item.compressorMode = `transform ${fakeOpenAiKey}`;
      item.zeroSavingsReasons = ["source_code_not_compressed", `raw ${fakeOpenAiKey}`];
    }
  }];
  const c = await runRequestPipeline(ctx("original"), () => true, { store: new RetrievalStore() }, middlewares);
  assert.deepEqual(c.skipReasons, { safe_reason: 2 });
  assert.deepEqual(c.contentKindCounts, { log: 1 });
  assert.equal(c.effectivePluginIds?.[0], "context-compressor-plugin");
  assert.match(c.effectivePluginIds?.[1] ?? "", /^raw__REDACTED_SECRET:openai_api_key:sha256:[a-f0-9]{12}_$/);
  assert.match(c.compressorMode ?? "", /^transform__REDACTED_SECRET:openai_api_key:sha256:[a-f0-9]{12}_$/);
  assert.equal(c.zeroSavingsReasons?.[0], "source_code_not_compressed");
  assert.match(c.zeroSavingsReasons?.[1] ?? "", /^raw__REDACTED_SECRET:openai_api_key:sha256:[a-f0-9]{12}_$/);
  assert.equal(c.contentFingerprints, undefined);
  assert.ok(c.notes.some((note) => note === "plugin_metric_rejected:metrics:contentFingerprints"));
});
