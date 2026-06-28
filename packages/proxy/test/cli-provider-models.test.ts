import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, setupKey } from "./proxy-auth-utils.ts";

test("CLI providers answer model list requests without spawning the CLI", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-models-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "must-not-run.cjs");
    await writeFile(script, "process.exit(70);");
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-work",
      providers: [{
        id: "codex-work", name: "Codex Work", kind: "cli",
        target: "cli://codex-work", runtime: "codex",
        cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin"
      }],
      activeProviderId: "codex-work",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const key = await setupKey(base, "cli-models");
    const response = await fetch(`${base}/v1/models`, { headers: auth(key) });
    assert.equal(response.status, 200);
    const json = await response.json() as { data: Array<{ id: string }> };
    assert.deepEqual(json.data.map((item) => item.id), ["codex-work", "gpt-5"]);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});
