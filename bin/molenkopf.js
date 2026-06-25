#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeRoot = runtimeRootFor(root);
const entry = join(runtimeRoot, "packages", "proxy", "src", "cli", "main.ts");
const child = spawn(process.execPath, [
  "--experimental-strip-types",
  "--experimental-sqlite",
  "--disable-warning=ExperimentalWarning",
  entry,
  ...process.argv.slice(2)
], { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

function runtimeRootFor(sourceRoot) {
  if (!sourceRoot.split(/[\\/]/).includes("node_modules")) return sourceRoot;
  const cacheRoot = join(tmpdir(), "molenkopf-cli", createHash("sha256").update(sourceRoot).digest("hex").slice(0, 16));
  const cachedEntry = join(cacheRoot, "packages", "proxy", "src", "cli", "main.ts");
  if (!existsSync(cachedEntry)) {
    mkdirSync(cacheRoot, { recursive: true });
    for (const name of ["package.json", "packages", "bin"]) {
      cpSync(join(sourceRoot, name), join(cacheRoot, name), { recursive: true });
    }
  }
  return cacheRoot;
}
