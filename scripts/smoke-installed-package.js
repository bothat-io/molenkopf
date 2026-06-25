import { mkdtemp, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packRelease } from "./release-pack.js";

const root = process.cwd();
const dir = await mkdtemp(join(tmpdir(), "molenkopf-install-smoke-"));
const npmCli = process.env.npm_execpath;

try {
  runNpm(["run", "prepack"], root, "pipe");
  const tarball = packRelease(root);
  const consumer = join(dir, "consumer");
  runNpm(["init", "-y"], dir, "ignore");
  await rm(consumer, { recursive: true, force: true });
  runNpm(["install", join(root, tarball)], dir, "ignore");
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
