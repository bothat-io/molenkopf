import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startProxy } from "../src/http/server.ts";

test("control plane stores agent draft metadata without raw tokens", async () => {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-control-plane-"));
  try {
    await listen(upstream);
    const target = `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`;
    proxy = await startProxy({ port: 0, target, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);

    const empty = await fetch(`${base}/__molenkopf/agents`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.deepEqual(empty.items, []);
    assert.equal(empty.tokenPolicy, "hash-only; raw token values rejected");

    const rejected = await post(`${base}/__molenkopf/agents/draft`, { id: "ci", label: "CI", token: "sk-secret" }, admin);
    assert.equal(rejected.status, 400);
    assert.doesNotMatch(await rejected.text(), /sk-secret/);

    const accepted = await post(`${base}/__molenkopf/agents/draft`, {
      id: "ci",
      label: "CI agent",
      kind: "CI agent",
      providerId: "default",
      tokenHash: "a".repeat(64),
      enabledPluginIds: ["context-compressor-plugin", "obsidian-graph-plugin"]
    }, admin);
    assert.equal(accepted.status, 200);
    const saved = await accepted.json();
    assert.equal(saved.item.id, "ci");
    assert.equal(saved.item.kind, "CI agent");
    assert.equal(saved.item.tokenHashPresent, true);
    assert.equal(saved.item.tokenFingerprint, `sha256:${"a".repeat(8)}`);
    assert.equal(saved.item.tokenHash, undefined);
    assert.doesNotMatch(JSON.stringify(saved), /sk-secret/);

    const agents = await fetch(`${base}/__molenkopf/agents`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(agents.items.length, 1);
    assert.equal(agents.items[0].providerId, "default");
    assert.equal(agents.items[0].kind, "CI agent");
    assert.equal(agents.items[0].tokenHashPresent, true);
    assert.equal(agents.items[0].tokenHash, undefined);
  } finally {
    if (proxy) await proxy.close();
    await close(upstream);
    await rm(dataDir, { recursive: true, force: true });
  }
});

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function setupAdmin(base: string): Promise<string> {
  const response = await post(`${base}/__molenkopf/setup-admin`, { username: "admin", password: "admin-secret" });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

function post(url: string, body: unknown, cookie = "") {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}
