import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { loadPluginPageFromDir, pluginPageCacheEnabled } from "../src/http/plugin-page-loader.ts";

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
    const csp = page.headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src 'self' 'nonce-[^']+'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    const html = await page.text();
    assert.match(html, /Context compression/);
    assert.match(html, /<script nonce="[^"]+">/);
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
    const optimizer = await pluginFetch(base, "token-optimizer-plugin", cookie);
    assert.equal(optimizer.status, 200);
    const optimizerHtml = await optimizer.text();
    assert.match(optimizerHtml, /Token optimizer/);
    assert.match(optimizerHtml, /Cache metrics are not reported yet/);
    assert.match(optimizerHtml, /Pricing is not configured/);
    assert.match(optimizerHtml, /No plugin budget limit configured/);
    assert.match(optimizerHtml, /No confirmed compression savings recorded/);
    assert.match(optimizerHtml, /Compression status/);
    assert.match(optimizerHtml, /Zero-savings diagnostics/);
    assert.match(optimizerHtml, /Protected coding context/);
    assert.match(optimizerHtml, /Review this finding before changing routing/);
    const projectGraph = await pluginFetch(base, "project-graph-plugin", cookie);
    assert.equal(projectGraph.status, 200);
    const projectGraphHtml = await projectGraph.text();
    assert.doesNotMatch(projectGraphHtml, /Scan root/);
    assert.doesNotMatch(projectGraphHtml, /Run scan/);
    assert.doesNotMatch(projectGraphHtml, /Scan is running/);
    assert.doesNotMatch(projectGraphHtml, /Preview is running/);
    assert.match(projectGraphHtml, /token-derived graph controls/);
    assert.match(projectGraphHtml, /graph\.query/);
    assert.match(projectGraphHtml, /Unexpected .* response/);
    const missing = await pluginFetch(base, "does-not-exist", cookie);
    assert.equal(missing.status, 404);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("plugin pages are not cached in the dev profile", () => {
  assert.equal(pluginPageCacheEnabled({ MOLENKOPF_PROFILE: "dev" }), false);
  assert.equal(pluginPageCacheEnabled({ MOLENKOPF_PROFILE: "test" }), true);
});

test("cached plugin pages refresh after their file changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-plugin-cache-"));
  const pluginDir = join(root, "sample-plugin");
  try {
    await mkdir(pluginDir);
    await writeFile(join(pluginDir, "page.html"), "first", "utf8");
    assert.equal(loadPluginPageFromDir(root, "sample-plugin", true), "first");
    await writeFile(join(pluginDir, "page.html"), "second version", "utf8");
    assert.equal(loadPluginPageFromDir(root, "sample-plugin", true), "second version");
  } finally {
    await rm(root, { recursive: true, force: true });
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
