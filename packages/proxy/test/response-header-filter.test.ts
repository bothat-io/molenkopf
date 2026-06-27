import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, setupKey } from "./proxy-auth-utils.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

test("filters upstream response headers that could affect the dashboard origin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-header-filter-"));
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": "provider=owned; Path=/",
      "content-security-policy": "default-src *",
      "x-provider-trace": "safe"
    });
    res.end("{}");
  });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "header-filter");
    const response = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: "{}" });
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(response.headers.get("x-provider-trace"), "safe");
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
