import test from "node:test";
import assert from "node:assert/strict";
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
