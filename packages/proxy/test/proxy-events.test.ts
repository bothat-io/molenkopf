import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("event stream sends an immediate handshake so dashboards leave connecting state", async () => {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const controller = new AbortController();
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-events-"));
  try {
    await listen(upstream);
    const upstreamPort = (upstream.address() as { port: number }).port;
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const cookie = await setupAdmin(base);
    const response = await fetch(`${base}/__molenkopf/events`, { signal: controller.signal, headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const chunk = await response.body?.getReader().read();
    assert.match(new TextDecoder().decode(chunk?.value), /connected/);
  } finally {
    controller.abort();
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
  const response = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
