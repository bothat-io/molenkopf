import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function packRelease(cwd = process.cwd()) {
  const output = runNpm(["pack", "--json", "--ignore-scripts"], cwd).toString("utf8");
  const filename = parsePackResult(output);
  if (!existsSync(join(cwd, filename))) throw new Error(`packed tarball missing: ${filename}`);
  return filename;
}

export function parsePackResult(output) {
  const result = JSON.parse(output);
  if (!Array.isArray(result)) throw new Error("npm pack result must be an array");
  if (result.length !== 1) throw new Error(`npm pack must produce exactly one tarball, got ${result.length}`);
  const filename = result[0]?.filename;
  if (typeof filename !== "string" || !filename.trim()) throw new Error("npm pack result has no filename");
  return filename;
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio: "pipe" });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return execFileSync(npm, args, { cwd, stdio: "pipe", shell: process.platform === "win32" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(packRelease());
}
