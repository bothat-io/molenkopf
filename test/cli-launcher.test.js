import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

test("launcher kills an unresponsive child before cleaning staged runtime", { skip: process.platform === "win32" }, async () => {
  const root = await fakeInstall("process.on('SIGTERM', () => {}); await hold();\n");
  const pidFile = join(root.base, "child.pid");
  try {
    const before = await tempRuntimes(root.installed);
    const wrapper = spawn(process.execPath, [join(root.installed, "bin", "molenkopf.js")], {
      env: { ...process.env, CHILD_PID_FILE: pidFile, MOLENKOPF_LAUNCHER_GRACE_MS: "100" },
      stdio: "ignore"
    });
    const childPid = Number(await waitForFile(pidFile));
    wrapper.kill("SIGTERM");
    await waitForClose(wrapper);
    assert.equal(isAlive(childPid), false);
    assert.deepEqual(await tempRuntimes(root.installed), before);
  } finally {
    await rm(root.base, { recursive: true, force: true });
  }
});

test("launcher rolls back partial runtime staging failures", async () => {
  const base = await mkdtemp(join(tmpdir(), "molenkopf-launcher-bad-"));
  const installed = join(base, "node_modules", "molenkopf");
  try {
    await mkdir(join(installed, "bin"), { recursive: true });
    await writeFile(join(installed, "package.json"), "{\"type\":\"module\"}\n");
    await cp(resolve(repo, "bin", "molenkopf.js"), join(installed, "bin", "molenkopf.js"));
    await cp(resolve(repo, "bin", "launcher.js"), join(installed, "bin", "launcher.js"));
    const before = await tempRuntimes(installed);
    const wrapper = spawn(process.execPath, [join(installed, "bin", "molenkopf.js")], { stdio: "ignore" });
    const result = await waitForClose(wrapper);
    assert.notEqual(result.code, 0);
    assert.deepEqual(await tempRuntimes(installed), before);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("launcher preserves child signal exits on POSIX", { skip: process.platform === "win32" }, async () => {
  const root = await fakeInstall("process.kill(process.pid, 'SIGTERM');\n");
  try {
    const wrapper = spawn(process.execPath, [join(root.installed, "bin", "molenkopf.js")], { stdio: "ignore" });
    const result = await waitForClose(wrapper);
    assert.equal(result.signal, "SIGTERM");
  } finally {
    await rm(root.base, { recursive: true, force: true });
  }
});

async function fakeInstall(mainBody) {
  const base = await mkdtemp(join(tmpdir(), "molenkopf-launcher-"));
  const installed = join(base, "node_modules", "molenkopf");
  const entryDir = join(installed, "packages", "proxy", "src", "cli");
  await mkdir(join(installed, "bin"), { recursive: true });
  await mkdir(entryDir, { recursive: true });
  await writeFile(join(installed, "package.json"), "{\"type\":\"module\"}\n");
  await cp(resolve(repo, "bin", "molenkopf.js"), join(installed, "bin", "molenkopf.js"));
  await cp(resolve(repo, "bin", "launcher.js"), join(installed, "bin", "launcher.js"));
  await writeFile(join(entryDir, "main.ts"), `import { writeFileSync } from "node:fs";\nif (process.env.CHILD_PID_FILE) writeFileSync(process.env.CHILD_PID_FILE, String(process.pid));\nconst hold = () => new Promise(() => {});\n${mainBody}`);
  return { base, installed };
}

async function tempRuntimes(installed) {
  const prefix = `molenkopf-cli-${createHash("sha256").update(installed).digest("hex").slice(0, 12)}-`;
  return (await readdir(tmpdir())).filter((name) => name.startsWith(prefix)).sort();
}

async function waitForFile(path) {
  for (let i = 0; i < 50; i++) {
    try { return await readFile(path, "utf8"); } catch { await delay(20); }
  }
  throw new Error(`timed out waiting for ${path}`);
}

function waitForClose(child) {
  return new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal })));
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
