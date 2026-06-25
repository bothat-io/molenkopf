import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("CLI self-test matches bounded retrieval policy", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-cli-self-"));
  try {
    const result = await runCli(["self-test"], { MOLENKOPF_DATA_DIR: dataDir });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /self-test ok/);
    assert.equal(result.stderr, "");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("CLI help exits successfully", async () => {
  const result = await runCli(["--help"], {});
  assert.equal(result.code, 0);
  assert.match(result.stderr, /usage:/);
});

function runCli(args: string[], env: Record<string, string | undefined>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      "--experimental-sqlite",
      "--disable-warning=ExperimentalWarning",
      "packages/proxy/src/cli/main.ts",
      ...args
    ], { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
