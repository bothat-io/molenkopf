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
  const middlewares: PluginMiddleware[] = [{
    id: "metrics",
    run(item) {
      item.skipReasons = { safe_reason: 2, [`raw ${["sk", "test-secret"].join("-")}`]: Number.POSITIVE_INFINITY };
      item.contentKindCounts = { log: 1, bad: Number.NaN };
      item.contentFingerprints = [{ hash: "not-a-hash", contentKind: "log", originalBytes: 1, estimatedOriginalTokens: 1, compressed: false } as any];
    }
  }];
  const c = await runRequestPipeline(ctx("original"), () => true, { store: new RetrievalStore() }, middlewares);
  assert.deepEqual(c.skipReasons, { safe_reason: 2 });
  assert.deepEqual(c.contentKindCounts, { log: 1 });
  assert.equal(c.contentFingerprints, undefined);
  assert.ok(c.notes.some((note) => note === "plugin_metric_rejected:metrics:contentFingerprints"));
});
