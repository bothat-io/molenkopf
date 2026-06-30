import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("startProxy rejects cleanly when the port is already in use", async () => {
  const first = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1" });
  try {
    await assert.rejects(
      startProxy({ port: first.port, target: "http://127.0.0.1:9/v1" }),
      (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE"
    );
  } finally {
    await first.close();
  }
});

test("failed startup releases resources before retrying on the same data dir", async () => {
  const blocker = createServer((_req, res) => res.end("busy"));
  const port = await listenOn(blocker);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-listen-retry-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await assert.rejects(
      startProxy({ port, target: "http://127.0.0.1:9/v1", dataDir }),
      (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE"
    );
    await closeServer(blocker);
    proxy = await startProxy({ port, target: "http://127.0.0.1:9/v1", dataDir });
    assert.equal(proxy.port, port);
  } finally {
    if (proxy) await proxy.close();
    if (blocker.listening) await closeServer(blocker);
    await rm(dataDir, { recursive: true, force: true });
  }
});

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return typeof address === "object" && address ? address.port : 0;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
