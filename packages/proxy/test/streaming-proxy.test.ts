import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import type { RunningProxy } from "../src/http/server-types.ts";
import { auth, issueKey, setupKey } from "./proxy-auth-utils.ts";
async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
async function latestWithUsage(base: string, cookie: string): Promise<any> {
  for (let i = 0; i < 40; i++) {
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((r) => r.json());
    if (latest.upstreamInputTokens === 11) return latest;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((r) => r.json());
}
async function latestStatus(base: string, status: number, cookie: string): Promise<any> {
  for (let i = 0; i < 40; i++) {
    const latest = await fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((r) => r.json());
    if (latest.statusCode === status) return latest;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fetch(`${base}/__molenkopf/requests/latest`, { headers: { cookie } }).then((r) => r.json());
}
test("streams an SSE response through incrementally without buffering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-stream-"));
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write("data: one\n\n");
    setTimeout(() => {
      res.write("data: two\n\n");
      res.end();
    }, 40);
  });
  const upstreamPort = await listenOn(upstream);
  const proxy: RunningProxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "stream");
    const res = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const firstChunk = decoder.decode((await reader.read()).value);
    assert.match(firstChunk, /data: one/);
    assert.ok(!firstChunk.includes("data: two"), "second event must not arrive in the first chunk (proof of streaming)");
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    assert.match(rest, /data: two/);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("passes a gzip-encoded response body through unmodified with intact headers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-gzip-"));
  const payload = JSON.stringify({ message: "hello transparent gateway", n: 42, usage: { input_tokens: 11, output_tokens: 13 } });
  const gz = gzipSync(Buffer.from(payload));
  const upstream = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip", "content-length": String(gz.length) });
    res.end(gz);
  });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "gzip");
    const res = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" });
    assert.equal(res.headers.get("content-encoding"), "gzip");
    const decoded = await res.json();
    assert.deepEqual(decoded, { message: "hello transparent gateway", n: 42, usage: { input_tokens: 11, output_tokens: 13 } });
    const latest = await latestWithUsage(base, admin);
    assert.equal(latest.upstreamOutputTokens, 13);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("upstream timeout returns a proxy error instead of hanging", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-upstream-timeout-"));
  const oldTimeout = process.env.MOLENKOPF_UPSTREAM_TIMEOUT_MS;
  const upstream = createServer((req) => { req.resume(); });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  try {
    process.env.MOLENKOPF_UPSTREAM_TIMEOUT_MS = "100";
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "timeout");
    const started = Date.now();
    const response = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" });
    const elapsed = Date.now() - started;
    const body = await response.json() as { error: string; requestId: string };
    assert.equal(response.status, 502);
    assert.equal(body.error, "proxy_error");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.ok(elapsed < 2000, `timeout should return quickly, got ${elapsed}ms`);
  } finally {
    if (oldTimeout === undefined) delete process.env.MOLENKOPF_UPSTREAM_TIMEOUT_MS;
    else process.env.MOLENKOPF_UPSTREAM_TIMEOUT_MS = oldTimeout;
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("proxy request body limit returns 413 before upstream forwarding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-body-limit-"));
  const oldLimit = process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES;
  let hits = 0;
  const upstream = createServer((req, res) => { hits++; req.resume(); res.writeHead(200); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  try {
    process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES = "8";
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "body-limit");
    const response = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ input: "too large" }) });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "request_body_too_large" });
    assert.equal(hits, 0);
  } finally {
    if (oldLimit === undefined) delete process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES;
    else process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES = oldLimit;
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("aborted upstream response after headers is audited as a proxy error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-upstream-abort-"));
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("partial");
    setTimeout(() => res.destroy(new Error("abort upstream body")), 10);
  });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "upstream-abort");
    const response = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" }).catch((error) => error);
    if (response instanceof Response) await response.text().catch(() => {});
    const latest = await latestStatus(base, 502, admin);
    assert.equal(latest.statusCode, 502);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function setupAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  assert.equal(response.status, 200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
