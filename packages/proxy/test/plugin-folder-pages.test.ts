import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

test("serves a plugin's own page from its plugin folder", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-plugin-pages-"));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const cookie = await cookieFor(base);
    const page = await pluginFetch(base, "context-compressor-plugin", cookie);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Context compression/);
    assert.match(html, /Projects \/ API keys/);
    assert.match(html, /Input tokens/);
    assert.match(html, /Output tokens/);
    assert.match(html, /Provider savings/);
    assert.match(html, /Endpoint pressure/);
    assert.match(html, /Recent grouped activity/);
    assert.match(html, /Token funnel/);
    assert.match(html, /Payload reduction chart/);
    assert.match(html, /Recent activity chart/);
    assert.match(html, /Refresh snapshot/);
    assert.match(html, /Plugin data unavailable/);
    assert.doesNotMatch(html, /catch\(\(\) => \(\{\}\)\)/);
    assert.doesNotMatch(html, /setInterval/);
    const graph = await pluginFetch(base, "obsidian-graph-plugin", cookie);
    assert.equal(graph.status, 200);
    const graphHtml = await graph.text();
    assert.match(graphHtml, /Memory graph/);
    assert.match(graphHtml, /Input tokens/);
    assert.match(graphHtml, /Output tokens/);
    assert.match(graphHtml, /Projects/);
    assert.match(graphHtml, /Plugin data unavailable/);
    assert.doesNotMatch(graphHtml, /catch\(\(\) => \(\{\}\)\)/);
    assert.doesNotMatch(graphHtml, /setInterval/);
    const missing = await pluginFetch(base, "does-not-exist", cookie);
    assert.equal(missing.status, 404);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

async function cookieFor(base: string): Promise<string> {
  const setup = await fetch(`${base}/__molenkopf/setup-admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin-secret" })
  });
  return (setup.headers.get("set-cookie") ?? "").split(";")[0];
}

function pluginFetch(base: string, id: string, cookie: string): Promise<Response> {
  return fetch(`${base}/__molenkopf/plugins/${id}/page`, cookie ? { headers: { cookie } } : undefined);
}
