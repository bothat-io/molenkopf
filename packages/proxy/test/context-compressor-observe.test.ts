import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { builtinMiddlewares, runRequestPipeline, type PluginContext } from "../src/http/plugin-pipeline.ts";

function ctx(body: string): PluginContext {
  const c: PluginContext = {
    requestId: "r1", method: "POST", path: "/v1/messages", consumerId: "user:operator", providerId: "default",
    body, settingsFor: () => ({ mode: "observe" }), redactedSecrets: 0, compressedItems: 0, savedTokens: 0,
    retrievalIds: [], compressorsUsed: [], notes: [], usageOf: () => ({ requests: 0, inputTokens: 0, outputTokens: 0 }),
    note(m) { c.notes.push(m); }
  };
  return c;
}

test("context compressor observe mode reports potential savings without mutating", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-observe-plugin-"));
  const store = new RetrievalStore(dir);
  try {
    const log = Array.from({ length: 320 }, (_, i) => `line ${i} repeated output`).join("\n") + "\nERROR final failure";
    const body = JSON.stringify({ input: log });
    const c = ctx(body);
    await runRequestPipeline(c, () => true, { store, fingerprintSecret: "local-secret" }, builtinMiddlewares);

    assert.equal(c.body, body);
    assert.equal(c.compressedItems, 0);
    assert.equal(c.savedTokens, 0);
    assert.equal(c.potentialCompressedItems, 1);
    assert.equal(c.potentialSavedTokens! > 0, true);
    assert.equal(c.potentialSavedBytes! > 0, true);
    assert.deepEqual(c.retrievalIds, []);
    assert.equal(c.contentFingerprints?.length, 1);
    assert.equal(c.skipReasons?.observe_only, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
