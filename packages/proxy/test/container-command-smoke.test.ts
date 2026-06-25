import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("container command reaches health setup and plugin pages", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-container-cmd-"));
  let child: ChildProcessWithoutNullStreams | undefined;
  try {
    child = spawn(process.execPath, [
      "--experimental-strip-types",
      "--experimental-sqlite",
      "--disable-warning=ExperimentalWarning",
      "packages/proxy/src/cli/main.ts",
      "proxy",
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--data-dir",
      dataDir,
      "--target",
      "http://127.0.0.1:9/v1"
    ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    const base = await waitForListening(child);

    assert.deepEqual(await fetchJson(`${base}/__molenkopf/health`), { ok: true });
    const before = await fetchJson(`${base}/__molenkopf/me`) as { needsSetup?: boolean };
    assert.equal(before.needsSetup, true);
    const setup = await fetch(`${base}/__molenkopf/setup-admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-secret" })
    });
    assert.equal(setup.status, 200);
    const cookie = (setup.headers.get("set-cookie") ?? "").split(";")[0];
    const plugins = await fetchJson(`${base}/__molenkopf/plugins`, { headers: { cookie } }) as { items: { id: string; pagePath?: string }[] };
    assert.deepEqual(plugins.items.map((item) => item.id).sort(), ["context-compressor-plugin", "obsidian-graph-plugin"]);
    for (const plugin of plugins.items) {
      assert.equal((await fetch(`${base}${plugin.pagePath}`, { headers: { cookie } })).status, 200);
    }
  } finally {
    if (child) await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  }
});

function waitForListening(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const timer = setTimeout(() => reject(new Error(`proxy did not start: ${stderr || stdout}`)), 10000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/Molenkopf proxy listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`proxy exited before ready: ${code}; ${stderr}`)));
  });
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  assert.equal(response.status, 200);
  return response.json();
}

function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
    setTimeout(resolve, 3000);
  });
}
