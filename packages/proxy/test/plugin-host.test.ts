import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../core/src/events/event-bus.ts";
import { pluginCatalog } from "../../core/src/plugins/plugin-catalog.ts";
import { RetrievalStore } from "../../core/src/store/retrieval-store.ts";
import { createPluginHost } from "../src/http/plugin-host.ts";
import { pluginView } from "../src/http/local-api-state.ts";
import { createRuntimeState } from "../src/http/runtime-state.ts";
import { buildManifest, finishRequest } from "../src/http/request-finish.ts";

test("plugin host runs lifecycle, event, audit, and data hooks", async () => {
  const calls: string[] = [];
  const state = createRuntimeState({ target: "http://127.0.0.1:1/v1" }, "127.0.0.1");
  const events = new EventBus();
  const host = createPluginHost(state, { store: new RetrievalStore(), events }, {
    "context-compressor-plugin": {
      onBoot: () => { calls.push("context:boot"); },
      onEnable: () => { calls.push("context:enable"); },
      onStop: () => { calls.push("context:stop"); }
    },
    "token-optimizer-plugin": {
      onBoot: () => { calls.push("optimizer:boot"); },
      onStart: (ctx) => { calls.push(`optimizer:start:${ctx.port}`); },
      onDisable: () => { calls.push("optimizer:disable"); },
      onStop: () => { calls.push("optimizer:stop"); },
      onEvent: (ctx) => { calls.push(`optimizer:event:${ctx.event}`); },
      onAudit: (ctx) => { calls.push(`optimizer:audit:${ctx.requestId}`); },
      getData: (ctx) => ({ plugin: ctx.plugin, requests: ctx.manifests.length })
    }
  });

  await host.boot();
  await host.start(8787);
  events.emit("request_started", { requestId: "r1", data: { path: "/v1/responses" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await host.audit({
    requestId: "r1", timestamp: "2026-06-24T00:00:00.000Z", method: "POST", path: "/v1/responses",
    targetHost: "127.0.0.1", providerId: "default", compressedItems: 0, estimatedOriginalTokens: 0,
    estimatedCompressedTokens: 0, estimatedSavedTokens: 0, redactedSecrets: 0, retrievalIds: [],
    compressorsUsed: [], warnings: [], statusCode: 200, durationMs: 1
  });
  const data = await host.data("token-optimizer-plugin", {
    canManage: true, teamIds: [], scope: "data", plugin: { id: "token-optimizer-plugin" },
    scopes: ["metrics"], manifests: [{ requestId: "r1", timestamp: "", method: "POST", path: "/v1/responses", targetHost: "127.0.0.1", compressedItems: 0, estimatedOriginalTokens: 0, estimatedCompressedTokens: 0, estimatedSavedTokens: 0, redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [] }]
  });
  await host.enable("context-compressor-plugin");
  await host.disable("token-optimizer-plugin");
  await host.stop();

  assert.deepEqual(data, { ok: true, payload: { plugin: { id: "token-optimizer-plugin" }, requests: 1 } });
  assert.deepEqual(calls, [
    "context:boot", "optimizer:boot", "optimizer:start:8787", "optimizer:event:request_started",
    "optimizer:audit:r1", "context:enable", "optimizer:disable", "context:stop", "optimizer:stop"
  ]);
});

test("plugin host records sanitized lifecycle failures and serializes event hooks", async () => {
  const state = createRuntimeState({ target: "http://127.0.0.1:1/v1" }, "127.0.0.1");
  const events = new EventBus();
  const order: string[] = [], warnings: any[] = [];
  events.subscribe((event) => { if (event.type === "warning") warnings.push(event.data); });
  const host = createPluginHost(state, { store: new RetrievalStore(), events }, {
    "token-optimizer-plugin": {
      onStart: () => { throw new Error("sk-secret raw prompt"); },
      onEvent: async (ctx) => {
        if (ctx.data.index === undefined) return;
        order.push(`start:${ctx.data.index}`);
        await new Promise((resolve) => setTimeout(resolve, ctx.data.index === 1 ? 10 : 0));
        order.push(`end:${ctx.data.index}`);
      }
    }
  });
  await host.start(8787);
  events.emit("request_started", { data: { index: 1 } });
  events.emit("request_finished", { data: { index: 2 } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(state.pluginLifecycle["token-optimizer-plugin"], { status: "error", hook: "onStart", error: "plugin_hook_failed" });
  const plugin = pluginCatalog.find((item) => item.id === "token-optimizer-plugin");
  assert.ok(plugin);
  assert.equal(pluginView(plugin, state).lifecycleStatus, "error");
  assert.equal(pluginView(plugin, state).lifecycleError, "plugin_hook_failed");
  assert.doesNotMatch(JSON.stringify(warnings), /sk-secret|raw prompt/);
  assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2"]);
});

test("request plugin policy gates event and audit hooks", async () => {
  const calls: string[] = [];
  const state = createRuntimeState({ target: "http://127.0.0.1:1/v1" }, "127.0.0.1");
  const events = new EventBus();
  const host = createPluginHost(state, { store: new RetrievalStore(), events }, {
    "token-optimizer-plugin": {
      onEvent: (ctx) => { calls.push(`event:${ctx.event}`); },
      onAudit: (ctx) => { calls.push(`audit:${ctx.requestId}`); }
    }
  });
  await host.start(8787);
  host.setRequestPlugins("blocked", []);
  events.emit("request_started", { requestId: "blocked", data: { path: "/v1/responses" } });
  await host.audit(manifest("blocked"), []);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, []);
  await finishRequest(manifest("blocked-graph"), fakeAuditStore(), events, state, host, []);

  host.setRequestPlugins("allowed", ["token-optimizer-plugin"]);
  events.emit("request_started", { requestId: "allowed", data: { path: "/v1/responses" } });
  await host.audit(manifest("allowed"), ["token-optimizer-plugin"]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await finishRequest(manifest("allowed-graph"), fakeAuditStore(), events, state, host, ["token-optimizer-plugin"]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(calls.includes("event:request_started"));
  assert.ok(calls.includes("audit:allowed"));
  assert.ok(calls.includes("audit:allowed-graph"));
  assert.ok(calls.includes("event:request_finished"));
  await host.stop();
});

function manifest(requestId: string) {
  return buildManifest(requestId, "POST", "/v1/responses", "http://127.0.0.1:1/v1", "default", 200, 1, { id: "key:test", label: "key:test", source: "api_key" });
}

function fakeAuditStore() {
  return { write: async () => {} } as any;
}
