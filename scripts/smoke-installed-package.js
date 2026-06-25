import { mkdtemp, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dir = await mkdtemp(join(tmpdir(), "molenkopf-install-smoke-"));
const npmCli = process.env.npm_execpath;

try {
  const pack = JSON.parse(packJson(runNpm(["pack", "--json"], root, "pipe").toString("utf8")))[0];
  const consumer = join(dir, "consumer");
  runNpm(["init", "-y"], dir, "ignore");
  await rm(consumer, { recursive: true, force: true });
  runNpm(["install", join(root, pack.filename)], dir, "ignore");
  const bin = join(dir, "node_modules", "molenkopf", "bin", "molenkopf.js");
  const before = await tempRuntimeDirs();
  execFileSync(process.execPath, [bin, "--help"], { cwd: dir, stdio: "pipe" });
  execFileSync(process.execPath, [bin, "self-test"], { cwd: dir, stdio: "pipe" });
  const leaked = (await tempRuntimeDirs()).filter((name) => !before.includes(name));
  if (leaked.length) throw new Error(`temporary runtime leaked: ${leaked.join(", ")}`);
  console.log("installed package smoke ok");
} finally {
  await rm(dir, { recursive: true, force: true });
}

async function tempRuntimeDirs() {
  return (await readdir(tmpdir())).filter((name) => name.startsWith("molenkopf-cli-"));
}

function runNpm(args, cwd, stdio) {
  if (npmCli) return execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio });
  return execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, stdio, shell: process.platform === "win32" });
}

function packJson(output) {
  for (let start = output.indexOf("["); start >= 0; start = output.indexOf("[", start + 1)) {
    try {
      const parsed = JSON.parse(output.slice(start));
      if (Array.isArray(parsed) && parsed[0]?.filename) return output.slice(start);
    } catch {
      // Try the next array opener; prepack output can precede npm's JSON.
    }
  }
  throw new Error("npm pack did not return JSON");
}
