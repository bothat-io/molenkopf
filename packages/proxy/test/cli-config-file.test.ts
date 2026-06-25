import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProxyConfig, resolveConfigPath } from "../src/cli/config-loader.ts";

test("loads explicit Molenkopf JSON config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-config-"));
  try {
    const file = join(dir, "molenkopf.config.json");
    await writeFile(file, configText("https://api.openai.com/v1"));
    const loaded = await loadProxyConfig(new Map([["config", file]]), {}, dir);

    assert.equal(loaded.source, "file");
    assert.equal(loaded.config?.providers[0].id, "openai-main");
    assert.equal(loaded.config?.providers[0].credentialRef, "env:OPENAI_MAIN_API_KEY");
    assert.equal(loaded.config?.providers[0].credentialEnv, "OPENAI_MAIN_API_KEY");
    assert.equal(loaded.config?.providers[0].credentialValue, undefined);
    assert.equal(loaded.config?.activeProviderId, "openai-main");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("discovers default config and uses env mode when missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-config-"));
  try {
    assert.equal(await resolveConfigPath(new Map(), {}, dir), undefined);
    assert.deepEqual(await loadProxyConfig(new Map(), {}, dir), { source: "env" });

    const file = join(dir, "molenkopf.config.json");
    await writeFile(file, configText("https://api.openai.com/v1"));
    assert.equal(await resolveConfigPath(new Map(), {}, dir), file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fails for missing explicit config without leaking file contents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-config-"));
  try {
    await assert.rejects(loadProxyConfig(new Map([["config", "missing.json"]]), {}, dir), /config file not found/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function configText(target: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    providers: [{
      id: "openai-main",
      name: "OpenAI Main",
      kind: "openai-compatible",
      baseUrl: target,
      auth: { scheme: "bearer", credentialRef: "env:OPENAI_MAIN_API_KEY" }
    }]
  });
}
