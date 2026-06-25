import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { pluginCatalog } from "../../core/src/plugins/plugin-catalog.ts";
import { runRequestPipeline, builtinMiddlewares, middlewareFromModule, type PluginContext, type PluginMiddleware } from "../src/http/plugin-pipeline.ts";

function ctx(body: string, overrides: Partial<PluginContext> = {}): PluginContext {
  const c: PluginContext = {
    requestId: "r1", method: "POST", path: "/v1/messages", consumerId: "user:operator", providerId: "default",
    body, redactedSecrets: 0, compressedItems: 0, savedTokens: 0, retrievalIds: [], compressorsUsed: [], notes: [],
    usageOf: () => ({ requests: 2, inputTokens: 500, outputTokens: 100 }),
    note(m) { c.notes.push(m); },
    ...overrides
  };
  return c;
}
const all = () => true;

test("a middleware can transform the body and the next one sees the change", async () => {
  const mw: PluginMiddleware[] = [
    { id: "a", mutates: ["transform"], run: (c) => { c.body = c.body.toUpperCase(); } },
    { id: "b", run: (c) => { if (c.body.includes("HELLO")) c.note("saw hello"); } }
  ];
  const c = await runRequestPipeline(ctx("hello"), all, { store: new RetrievalStore() }, mw);
  assert.equal(c.body, "HELLO");
  assert.deepEqual(c.notes, ["saw hello"]);
});

test("a TypeScript plugin request hook adapts to the middleware contract", async () => {
  const mw = middlewareFromModule("hooked", {
    onRequest: (request) => ({ body: request.body.toUpperCase(), notes: ["hooked"] })
  });
  const c = await runRequestPipeline(ctx("hello"), all, { store: new RetrievalStore() }, [{ ...mw, mutates: ["transform"] }]);
  assert.equal(c.body, "HELLO");
  assert.deepEqual(c.notes, ["hooked"]);
});

test("a middleware can block and stops the chain", async () => {
  let ran = false;
  const mw: PluginMiddleware[] = [
    { id: "guard", mutates: ["block"], run: (c) => { c.block = { status: 402, error: "quota" }; } },
    { id: "after", run: () => { ran = true; } }
  ];
  const c = await runRequestPipeline(ctx("{}"), all, { store: new RetrievalStore() }, mw);
  assert.deepEqual(c.block, { status: 402, error: "quota" });
  assert.equal(ran, false, "chain stops after a block");
});

test("a middleware can reroute by setting providerId and read per-consumer usage", async () => {
  const mw: PluginMiddleware[] = [
    { id: "router", mutates: ["route"], run: (c) => { if (c.usageOf("user:operator").inputTokens > 100) c.providerId = "backup"; } }
  ];
  const c = await runRequestPipeline(ctx("{}"), all, { store: new RetrievalStore() }, mw);
  assert.equal(c.providerId, "backup");
});

test("unauthorized middleware body changes are restored and block the chain", async () => {
  let ran = false;
  const mw: PluginMiddleware[] = [
    { id: "observer", run: (c) => { c.body = "changed"; } },
    { id: "after", run: () => { ran = true; } }
  ];
  const c = await runRequestPipeline(ctx("original"), all, { store: new RetrievalStore() }, mw);
  assert.equal(c.body, "original");
  assert.deepEqual(c.block, { status: 500, error: "plugin_capability_violation" });
  assert.deepEqual(c.notes, ["plugin_capability_violation:observer:body"]);
  assert.equal(ran, false);
});

test("unauthorized middleware route and block changes are restored", async () => {
  const route = await runRequestPipeline(ctx("{}"), all, { store: new RetrievalStore() }, [{ id: "observer", run: (c) => { c.providerId = "backup"; } }]);
  assert.equal(route.providerId, "default");
  assert.deepEqual(route.block, { status: 500, error: "plugin_capability_violation" });
  assert.deepEqual(route.notes, ["plugin_capability_violation:observer:route"]);

  const blocked = await runRequestPipeline(ctx("{}"), all, { store: new RetrievalStore() }, [{ id: "observer", run: (c) => { c.block = { status: 403, error: "nope" }; } }]);
  assert.deepEqual(blocked.block, { status: 500, error: "plugin_capability_violation" });
  assert.deepEqual(blocked.notes, ["plugin_capability_violation:observer:block"]);
});

test("plugin hook failures restore all context mutations and continue", async () => {
  const c = await runRequestPipeline(ctx("original"), all, { store: new RetrievalStore() }, [
    { id: "bad", mutates: ["transform", "route", "block"], run: (item) => {
      item.body = "changed"; item.providerId = "backup"; item.redactedSecrets = 9; item.compressedItems = 9;
      item.savedTokens = 9; item.retrievalIds.push("r"); item.compressorsUsed.push("c"); item.notes.push("raw"); item.block = { status: 499, error: "raw" };
      throw new Error("secret prompt");
    } },
    { id: "after", run: (item) => { item.notes.push("after"); } }
  ]);
  assert.equal(c.body, "original");
  assert.equal(c.providerId, "default");
  assert.equal(c.redactedSecrets, 0);
  assert.equal(c.compressedItems, 0);
  assert.equal(c.savedTokens, 0);
  assert.deepEqual(c.retrievalIds, []);
  assert.deepEqual(c.compressorsUsed, []);
  assert.deepEqual(c.block, undefined);
  assert.deepEqual(c.notes, ["plugin_hook_failed:bad", "after"]);
});

test("capability violations restore counters arrays and notes", async () => {
  const c = await runRequestPipeline(ctx("original"), all, { store: new RetrievalStore() }, [
    { id: "observer", run: (item) => {
      item.body = "changed"; item.redactedSecrets = 5; item.compressedItems = 5;
      item.savedTokens = 5; item.retrievalIds.push("r"); item.compressorsUsed.push("c"); item.notes.push("raw");
    } }
  ]);
  assert.equal(c.body, "original");
  assert.equal(c.redactedSecrets, 0);
  assert.equal(c.compressedItems, 0);
  assert.equal(c.savedTokens, 0);
  assert.deepEqual(c.retrievalIds, []);
  assert.deepEqual(c.compressorsUsed, []);
  assert.deepEqual(c.notes, ["plugin_capability_violation:observer:body"]);
});

test("core redaction runs before optional plugins", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-mw-"));
  const c = ctx(JSON.stringify({ note: "key " + "sk-ant-" + "abcdefghijklmnopqrstuvwxyz0123456789ABCD" }));
  await runRequestPipeline(c, () => false, { store: new RetrievalStore(dir) }, []);
  assert.doesNotMatch(c.body, new RegExp("sk-ant-" + "abcdefghijklmnopqrstuvwxyz"));
  assert.ok(c.redactedSecrets >= 1);
  await rm(dir, { recursive: true, force: true });
});

test("core redaction protects compression retrieval storage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-mw-safe-order-"));
  const store = new RetrievalStore(dir);
  try {
    const longLog = Array.from({ length: 260 }, (_, i) => `line ${i} token=plain-secret`).join("\n") + "\nERROR final failure";
    const c = await runRequestPipeline(ctx(JSON.stringify({ input: longLog })), all, { store }, builtinMiddlewares);
    assert.deepEqual(c.notes, []);
    assert.equal(c.retrievalIds.length, 1);
    const retrieved = await store.retrieve(c.retrievalIds[0]);
    assert.match(retrieved, /Context excerpt only/);
    assert.doesNotMatch(retrieved, /plain-secret/);
    assert.match(retrieved, /REDACTED_SECRET:token/);
    assert.doesNotMatch(retrieved, /line 259/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("disabled middlewares are skipped", async () => {
  let ran = false;
  const mw: PluginMiddleware[] = [{ id: "off", run: () => { ran = true; } }];
  await runRequestPipeline(ctx("{}"), (id) => id !== "off", { store: new RetrievalStore() }, mw);
  assert.equal(ran, false);
});

test("all optional builtin plugin middlewares have traffic contracts", () => {
  for (const middleware of builtinMiddlewares) {
    const plugin = pluginCatalog.find((item) => item.id === middleware.id);
    assert.ok(plugin, `${middleware.id} is missing from plugin catalog`);
    assert.ok(plugin.canToggle, `${middleware.id} must be optional`);
    assert.ok(plugin.traffic.mutates.includes("transform"), `${middleware.id} cannot transform request body`);
  }
});

test("all request hook plugin descriptors have runtime modules", () => {
  const middlewareIds = new Set(builtinMiddlewares.map((middleware) => middleware.id));
  for (const plugin of pluginCatalog.filter((item) => item.hooks.includes("request:body:rewrite"))) {
    assert.equal(middlewareIds.has(plugin.id), true, `${plugin.id} is missing a runtime module`);
  }
});
