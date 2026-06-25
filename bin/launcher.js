import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const signals = ["SIGINT", "SIGTERM"];

export function runLauncher(args = process.argv.slice(2), options = {}) {
  const root = options.sourceRoot ?? sourceRoot;
  const runtimeRoot = runtimeRootFor(root);
  const entry = join(runtimeRoot, "packages", "proxy", "src", "cli", "main.ts");
  if (!existsSync(entry)) throw new Error(`missing CLI entrypoint: ${entry}`);
  const child = spawn(process.execPath, ["--experimental-strip-types", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", entry, ...args], { stdio: options.stdio ?? "inherit" });
  let closeRequested = false;
  let finished = false;
  let forced = false;
  let requestedSignal = "";
  let graceTimer;

  const cleanup = () => cleanupRuntime(runtimeRoot, root);
  const finish = (code, signal) => {
    if (finished) return;
    finished = true;
    if (graceTimer) clearTimeout(graceTimer);
    for (const name of signals) process.removeListener(name, handlers[name]);
    cleanup();
    const finalSignal = requestedSignal || signal;
    if (finalSignal && !forced && process.platform !== "win32") process.kill(process.pid, finalSignal);
    process.exit(code ?? (forced ? 1 : 1));
  };
  const handlers = Object.fromEntries(signals.map((name) => [name, () => {
    if (closeRequested) return;
    closeRequested = true;
    requestedSignal = name;
    child.kill(name);
    graceTimer = setTimeout(() => {
      forced = true;
      child.kill("SIGKILL");
    }, Number(process.env.MOLENKOPF_LAUNCHER_GRACE_MS ?? 5000)).unref();
  }]));

  child.on("close", finish);
  child.on("error", (error) => {
    console.error(error.message);
    finish(1, null);
  });
  for (const name of signals) process.once(name, handlers[name]);
}

export function runtimeRootFor(root) {
  if (!root.split(/[\\/]/).includes("node_modules")) return root;
  const prefix = `molenkopf-cli-${createHash("sha256").update(root).digest("hex").slice(0, 12)}-`;
  const runtimeRoot = mkdtempSync(join(tmpdir(), prefix));
  try {
    try { chmodSync(runtimeRoot, 0o700); } catch { /* Windows ACLs are inherited. */ }
    for (const name of ["package.json", "packages", "bin"]) cpSync(join(root, name), join(runtimeRoot, name), { recursive: true });
    return runtimeRoot;
  } catch (error) {
    cleanupRuntime(runtimeRoot, root);
    throw error;
  }
}

export function cleanupRuntime(path, root = sourceRoot) {
  if (path === root) return;
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (error) {
    console.error(`cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}
