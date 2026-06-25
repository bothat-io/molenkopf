import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

test("launcher kills an unresponsive child before cleaning staged runtime", { skip: process.platform === "win32", timeout: 5000 }, async () => {
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
    const result = await waitForClose(wrapper, 3000);
    assert.equal(result.code, 1);
    await waitForDead(childPid);
    assert.deepEqual(await tempRuntimes(root.installed), before);
  } finally {
    await rm(root.base, { recursive: true, force: true });
  }
});

test("launcher rolls back partial runtime staging failures", { timeout: 5000 }, async () => {
  const base = await mkdtemp(join(tmpdir(), "molenkopf-launcher-bad-"));
  const installed = join(base, "node_modules", "molenkopf");
  try {
    await mkdir(join(installed, "bin"), { recursive: true });
    await writeFile(join(installed, "package.json"), "{\"type\":\"module\"}\n");
    await cp(resolve(repo, "bin", "molenkopf.js"), join(installed, "bin", "molenkopf.js"));
    await cp(resolve(repo, "bin", "launcher.js"), join(installed, "bin", "launcher.js"));
    const before = await tempRuntimes(installed);
    const wrapper = spawn(process.execPath, [join(installed, "bin", "molenkopf.js")], { stdio: "ignore" });
    const result = await waitForClose(wrapper, 3000);
    assert.notEqual(result.code, 0);
    assert.deepEqual(await tempRuntimes(installed), before);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("launcher preserves child signal exits on POSIX", { skip: process.platform === "win32", timeout: 5000 }, async () => {
  const root = await fakeInstall("process.kill(process.pid, 'SIGTERM');\n");
  try {
    const wrapper = spawn(process.execPath, [join(root.installed, "bin", "molenkopf.js")], { stdio: "ignore" });
    const result = await waitForClose(wrapper, 3000);
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

function waitForClose(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out waiting for child ${child.pid} to close`));
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForDead(pid) {
  for (let i = 0; i < 50; i++) {
    if (!isAlive(pid)) return;
    await delay(20);
  }
  assert.equal(isAlive(pid), false);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
