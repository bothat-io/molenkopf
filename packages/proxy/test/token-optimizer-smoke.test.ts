import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey } from "./proxy-auth-utils.ts";

test("optimizer smoke reports compression savings and protected source pressure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "optimizer-smoke-"));
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({
      port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir, providerCatalogMode: "explicit",
      providers: [{ id: "local-upstream", name: "Local upstream", kind: "local", target: `http://127.0.0.1:${upstreamPort}/v1`, authScheme: "none" }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "optimizer-smoke");
    await postJson(`${base}/__molenkopf/plugins/toggle`, { id: "context-compressor-plugin", enabled: true }, admin);

    const log = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR visible";
    const source = Array.from({ length: 180 }, (_, i) => `export function f${i}() { return ${i}; }`).join("\n");
    await postRequest(base, key, log);
    await postRequest(base, key, source);

    const data = await pollJson(`${base}/__molenkopf/plugins/token-optimizer-plugin/data`, (value) =>
      value.observations?.compressionStatus === "active-transformer"
      && value.observations?.protectedSourceTokens > 0
      && value.observations?.effectivePluginIds?.includes("context-compressor-plugin"), admin);
    assert.equal(data.observations.effectivePluginIds.includes("context-compressor-plugin"), true);
    assert.equal(data.observations.savedTokens > 0, true);
    assert.equal(data.observations.protectedSourceTokens > 0, true);
    assert.equal(data.observations.zeroSavingsReasons.source_code_not_compressed > 0, true);
  } finally {
    if (proxy) await proxy.close();
    await close(upstream);
    await rm(dir, { recursive: true, force: true });
  }
});

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function setupAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/setup-admin`, { username: "admin", password: "admin-secret" });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function postJson(url: string, body: unknown, cookie = "") {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

async function postRequest(base: string, key: string, input: string): Promise<void> {
  const response = await fetch(`${base}/v1/responses`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ input }) });
  await response.text();
}

async function pollJson(url: string, predicate: (value: any) => boolean, cookie: string): Promise<any> {
  for (let i = 0; i < 50; i++) {
    const value = await fetch(url, { headers: { cookie } }).then((r) => r.json());
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return fetch(url, { headers: { cookie } }).then((r) => r.json());
}
