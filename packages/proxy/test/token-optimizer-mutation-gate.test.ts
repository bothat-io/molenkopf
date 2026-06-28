import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { findPlugin } from "../../core/src/plugins/plugin-catalog.ts";
import { issueKey, setupAdmin } from "./proxy-auth-utils.ts";

test("token optimizer observes traffic without mutating request bodies", async () => {
  let upstreamBody = "";
  const upstream = createServer((req, res) => {
    req.setEncoding("utf8");
    req.on("data", (chunk) => { upstreamBody += chunk; });
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ usage: { input_tokens: 9, output_tokens: 3 } }));
    });
  });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-token-optimizer-"));
  try {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const port = (upstream.address() as { port: number }).port;
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "token-optimizer");
    const body = JSON.stringify({ input: "observe only" });
    await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body
    });
    const plugin = findPlugin("token-optimizer-plugin");
    assert.equal(plugin?.traffic.mutates.includes("none"), true);
    assert.equal(upstreamBody, body);
    const data = await fetch(`${base}/__molenkopf/plugins/token-optimizer-plugin/data`, { headers: { cookie: admin } }).then((res) => res.json());
    assert.equal(Array.isArray(data.recommendations), true);
  } finally {
    if (proxy) await proxy.close();
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    await rm(dataDir, { recursive: true, force: true });
  }
});
