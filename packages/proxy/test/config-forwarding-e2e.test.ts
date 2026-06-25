import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProxyConfig } from "../src/cli/config-loader.ts";

test("JSON config rejects credentials on private API targets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-config-e2e-"));
  try {
    const file = join(dir, "molenkopf.config.json");
    await writeFile(file, JSON.stringify({
      schemaVersion: 1,
      providers: [{ id: "openai-main", name: "OpenAI Main", kind: "openai-compatible", baseUrl: "http://127.0.0.1:9000/v1", auth: { scheme: "bearer", credentialRef: "env:OPENAI_MAIN_API_KEY" } }]
    }));
    await assert.rejects(loadProxyConfig(new Map([["config", file]]), process.env, dir), /unsafe private URL/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
