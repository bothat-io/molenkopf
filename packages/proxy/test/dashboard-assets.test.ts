import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("dashboard production dist serves known assets without SPA fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-dashboard-dist-"));
  const previous = process.env.MOLENKOPF_DASHBOARD_DIST;
  process.env.MOLENKOPF_DASHBOARD_DIST = dir;
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await mkdir(join(dir, "assets"), { recursive: true });
    await writeFile(join(dir, "index.html"), "<!doctype html><div id=\"root\">dashboard</div>");
    await writeFile(join(dir, "favicon.ico"), Buffer.from([0x00, 0x00, 0x01, 0x00]));
    await writeFile(join(dir, "favicon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(dir, "molenkopf-logo.png"), Buffer.from("logo-bytes"));
    await writeFile(join(dir, "assets", "index-test.js"), "console.log('ok');");
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;

    const index = await fetch(`${base}/__molenkopf/dashboard/settings`);
    const favicon = await fetch(`${base}/__molenkopf/dashboard/favicon.png`);
    const dashboardIcon = await fetch(`${base}/__molenkopf/dashboard/favicon.ico`);
    const rootFavicon = await fetch(`${base}/favicon.ico?token=secret`);
    const logo = await fetch(`${base}/__molenkopf/dashboard/molenkopf-logo.png`);
    const js = await fetch(`${base}/__molenkopf/dashboard/assets/index-test.js`);
    const missing = await fetch(`${base}/__molenkopf/dashboard/missing.png`);
    const malformed = await fetch(`${base}/__molenkopf/dashboard/assets/%E0%A4%A`);
    const traversal = await fetch(`${base}/__molenkopf/dashboard/assets/..%2Findex.html`);

    assert.equal(index.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(index.headers.get("content-security-policy"), "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    assert.equal(index.headers.get("referrer-policy"), "no-referrer");
    assert.equal(index.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await index.text(), "<!doctype html><div id=\"root\">dashboard</div>");
    assert.equal(favicon.headers.get("content-type"), "image/png");
    assert.deepEqual([...new Uint8Array(await favicon.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(dashboardIcon.headers.get("content-type"), "image/x-icon");
    assert.deepEqual([...new Uint8Array(await dashboardIcon.arrayBuffer())], [0x00, 0x00, 0x01, 0x00]);
    assert.equal(rootFavicon.headers.get("content-type"), "image/x-icon");
    assert.deepEqual([...new Uint8Array(await rootFavicon.arrayBuffer())], [0x00, 0x00, 0x01, 0x00]);
    assert.equal(await logo.text(), "logo-bytes");
    assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(js.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(js.headers.get("x-content-type-options"), "nosniff");
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("content-security-policy"), "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    assert.equal(malformed.status, 400);
    assert.equal(traversal.status, 400);
  } finally {
    if (previous === undefined) delete process.env.MOLENKOPF_DASHBOARD_DIST;
    else process.env.MOLENKOPF_DASHBOARD_DIST = previous;
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("root favicon falls back to public asset without dashboard build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-dashboard-nobuild-"));
  const previous = process.env.MOLENKOPF_DASHBOARD_DIST;
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    process.env.MOLENKOPF_DASHBOARD_DIST = join(dir, "missing-dist");
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const response = await fetch(`http://127.0.0.1:${proxy.port}/favicon.ico?token=secret`);
    const expected = await readFile(join(process.cwd(), "packages", "dashboard", "public", "favicon.ico"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/x-icon");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...expected]);
  } finally {
    if (previous === undefined) delete process.env.MOLENKOPF_DASHBOARD_DIST;
    else process.env.MOLENKOPF_DASHBOARD_DIST = previous;
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("dashboard dev proxy rejects absolute-form targets before contacting dev origin", async () => {
  let devHits = 0;
  const dev = createServer((req, res) => {
    devHits += 1;
    assert.ok(req.url === "/__molenkopf/dashboard/" || req.url === "/__molenkopf/dashboard/favicon.ico");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(req.url?.endsWith("favicon.ico") ? "icon" : "<div>dev dashboard</div>");
  });
  const previous = process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN;
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await listen(dev);
    const devPort = (dev.address() as { port: number }).port;
    process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = `http://127.0.0.1:${devPort}`;
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1" });
    const base = `http://127.0.0.1:${proxy.port}`;
    const ok = await fetch(`${base}/__molenkopf/dashboard`);
    const icon = await fetch(`${base}/favicon.ico?secret=hidden`);
    const blocked = await raw(proxy.port, "http://attacker.test/__molenkopf/dashboard");

    assert.equal(await ok.text(), "<div>dev dashboard</div>");
    assert.equal(await icon.text(), "icon");
    assert.equal(blocked.status, 400);
    assert.equal(devHits, 2);
  } finally {
    if (previous === undefined) delete process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN;
    else process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = previous;
    if (proxy) await proxy.close();
    await close(dev);
  }
});

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function raw(port: number, path: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "GET", path }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("error", reject);
    req.end();
  });
}
