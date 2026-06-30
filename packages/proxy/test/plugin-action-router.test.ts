import test from "node:test";
import assert from "node:assert/strict";
import { postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("generic plugin action route returns contract errors for missing, disabled, and actionless plugins", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-action-router-");
  try {
    const admin = await setupAdmin(env.base);

    const missing = await postAuth(env.base, "/__molenkopf/plugins/missing/actions/run", {}, admin);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "plugin_not_found" });

    const noAction = await postAuth(env.base, "/__molenkopf/plugins/token-optimizer-plugin/actions/run", {}, admin);
    assert.equal(noAction.status, 404);
    assert.deepEqual(await noAction.json(), { error: "plugin_action_not_found" });

    await putAuth(env.base, "/__molenkopf/plugin-policies/global", {
      globalPluginPolicy: { "token-optimizer-plugin": { enabled: false } }
    }, admin);
    const disabled = await postAuth(env.base, "/__molenkopf/plugins/token-optimizer-plugin/actions/run", {}, admin);
    assert.equal(disabled.status, 403);
    assert.deepEqual(await disabled.json(), { error: "plugin_disabled" });
  } finally {
    await env.close();
  }
});

test("plugin action route enforces confirmation and emits descriptor audit events", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-action-confirm-");
  try {
    const admin = await setupAdmin(env.base);
    const stream = await fetch(`${env.base}/__molenkopf/events`, { headers: { cookie: admin } });
    assert.equal(stream.status, 200);
    assert.ok(stream.body);
    const reader = stream.body.getReader();
    try {
      await readUntil(reader, "connected");
      const wrong = await postAuth(env.base, "/__molenkopf/plugins/project-graph-plugin/actions/graph.delete", { rootId: "root-a", confirm: "wrong" }, admin);
      assert.equal(wrong.status, 409);
      assert.deepEqual(await wrong.json(), { error: "confirmation_required" });

      const ok = await postAuth(env.base, "/__molenkopf/plugins/project-graph-plugin/actions/graph.delete", { rootId: "root-a", confirm: "root-a" }, admin);
      assert.equal(ok.status, 200);
      const event = await readUntil(reader, "graph.delete");
      assert.match(event, /plugin_event/);
      assert.match(event, /auditEvent/);
    } finally {
      await reader.cancel().catch(() => {});
    }
  } finally {
    await env.close();
  }
});

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 2000;
  while (!buffer.includes(text) && Date.now() < deadline) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value);
  }
  if (!buffer.includes(text)) throw new Error(`event stream did not include ${text}`);
  return buffer;
}
