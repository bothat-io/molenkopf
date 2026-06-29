import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { builtinMiddlewares, runRequestPipeline, type PluginContext } from "../src/http/plugin-pipeline.ts";
import { canStreamCli } from "../src/http/cli-stream-response.ts";

test("redaction preserves Responses JSON so CLI streaming can stay enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-stream-redaction-"));
  try {
    const secret = "sk-proj-" + "a".repeat(48);
    const log = [
      ...Array.from({ length: 300 }, (_, i) => `${i} INFO running tests`),
      `Authorization: Bearer ${secret}`,
      "ERROR failed at packages/core/src/auth.ts:12:3"
    ].join("\n");
    const body = JSON.stringify({
      model: "gpt-test",
      stream: true,
      input: [{ role: "user", content: [{ type: "input_text", text: log }] }]
    });
    const ctx = pluginContext(body);
    await runRequestPipeline(ctx, () => true, { store: new RetrievalStore(dir), fingerprintSecret: "local" }, builtinMiddlewares);

    assert.equal(JSON.parse(ctx.body).stream, true);
    assert.equal(canStreamCli("/v1/responses", ctx.body), true);
    assert.doesNotMatch(ctx.body, /sk-proj-/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("redaction preserves Anthropic Messages JSON so CLI streaming can stay enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-stream-redaction-anthropic-"));
  try {
    const secret = "sk-proj-" + "b".repeat(48);
    const body = JSON.stringify({
      model: "claude-test",
      stream: true,
      messages: [{ role: "user", content: `Authorization: Bearer ${secret}` }]
    });
    const ctx = pluginContext(body, "/v1/messages");
    await runRequestPipeline(ctx, () => true, { store: new RetrievalStore(dir), fingerprintSecret: "local" }, builtinMiddlewares);

    assert.equal(JSON.parse(ctx.body).stream, true);
    assert.equal(canStreamCli("/v1/messages", ctx.body), true);
    assert.doesNotMatch(ctx.body, /sk-proj-/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function pluginContext(body: string, path = "/v1/responses"): PluginContext {
  const ctx: PluginContext = {
    requestId: "req_1",
    method: "POST",
    path,
    consumerId: "user:test",
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
    note(message) { ctx.notes.push(message); }
  };
  return ctx;
}
