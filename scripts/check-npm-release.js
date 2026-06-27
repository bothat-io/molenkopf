import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedPackage = "@bothat-io/molenkopf";

export function packageFailures(pkg) {
  const failures = [];
  if (pkg.name !== expectedPackage) failures.push(`package name must be ${expectedPackage}`);
  if (pkg.private !== false) failures.push("package.json private must be false");
  if (!semver(pkg.version)) failures.push("package.json version must be SemVer");
  if (pkg.publishConfig?.access !== "public") failures.push("publishConfig.access must be public");
  return failures;
}

export function gitFailures(state, version) {
  const expectedTag = `v${version}`;
  const failures = [];
  if (state.branch !== "main") failures.push(`expected branch main, got ${state.branch || "unknown"}`);
  if (state.status.trim()) failures.push("working tree must be clean");
  if (!state.tags.includes(expectedTag)) failures.push(`HEAD must be tagged ${expectedTag}`);
  return failures;
}

export function publishCommand() {
  return "npm publish --access public";
}

function main() {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const failures = [
    ...packageFailures(pkg),
    ...gitFailures(gitState(root), pkg.version)
  ];
  let npmUser = "";
  try {
    npmUser = run("npm", ["whoami"], root).trim();
  } catch {
    failures.push("npm login required: run npm login, then npm whoami");
  }
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  console.log(`npm release check ok for ${pkg.name}@${pkg.version}`);
  console.log(`npm user: ${npmUser}`);
  console.log("Run after release:verify and GHCR tag release are green:");
  console.log(publishCommand());
}

function gitState(cwd) {
  return {
    branch: run("git", ["branch", "--show-current"], cwd).trim(),
    status: run("git", ["status", "--porcelain"], cwd),
    tags: run("git", ["tag", "--points-at", "HEAD"], cwd).split(/\r?\n/).filter(Boolean)
  };
}

function run(command, args, cwd) {
  const executable = command === "npm" && process.platform === "win32" ? "npm.cmd" : command;
  return execFileSync(executable, args, { cwd, encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
}

function semver(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
