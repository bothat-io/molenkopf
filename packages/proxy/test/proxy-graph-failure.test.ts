import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

// The memory graph is derived ONLY from real transferred text. A failed request
// with no meaningful body must not create nodes, and HTTP metadata (path,
// provider, status) must never leak into it.
test("failed upstream attempts do not appear as a memory graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-graph-"));
  const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: dir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 502);
    const data = await fetch(`${base}/__molenkopf/plugins/obsidian-graph-plugin/data`, { headers: { cookie: admin } }).then((item) => item.json());
    assert.equal(data.memoryGraph.nodes.length, 0, "no concepts from an empty failed request");
    assert.doesNotMatch(JSON.stringify(data), /POST \/v1\/responses|4xx|5xx|anonymous traffic|favicon/i);
  } finally {
    await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("memory graph does not rebuild from request metadata after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-graph-"));
  let proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: dir });
  try {
    await setupAdmin(`http://127.0.0.1:${proxy.port}`);
    await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await proxy.close();
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir: dir });
    const admin = await loginAdmin(`http://127.0.0.1:${proxy.port}`);
    const data = await fetch(`http://127.0.0.1:${proxy.port}/__molenkopf/plugins/obsidian-graph-plugin/data`, { headers: { cookie: admin } }).then((item) => item.json());
    assert.equal(data.memoryGraph.nodes.length, 0, "graph is text-derived in memory, not rebuilt from audit metadata");
    assert.doesNotMatch(JSON.stringify(data), /POST \/v1\/responses|anonymous traffic|favicon/i);
  } finally {
    await proxy.close().catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

async function setupAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function loginAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
