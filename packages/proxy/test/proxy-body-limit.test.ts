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

test("default proxy body limit accepts payloads larger than 8 MiB", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-default-body-limit-"));
  const oldLimit = process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES;
  delete process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES;
  let forwardedBytes = 0;
  const upstream = createServer((req, res) => {
    req.on("data", (chunk) => { forwardedBytes += Buffer.byteLength(chunk); });
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ forwardedBytes }));
    });
  });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ target: `http://127.0.0.1:${upstreamPort}/v1`, port: 0, dataDir: dir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "default-body-limit");
    const body = "x".repeat(9 * 1024 * 1024);
    const response = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: auth(key, { "content-type": "text/plain" }),
      body
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { forwardedBytes: Buffer.byteLength(body) });
  } finally {
    if (oldLimit === undefined) delete process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES;
    else process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES = oldLimit;
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
