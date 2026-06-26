import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const requiredFiles = [
  ".env.example",
  "bin/molenkopf.js",
  "packages/core/src/security/secret-redactor.ts",
  "packages/proxy/src/cli/main.ts",
  "packages/plugins/context-compressor-plugin/plugin.ts",
  "packages/dashboard/dist/index.html",
  "packages/dashboard/public/molenkopf-logo.png",
  "docs/DEPLOYMENT.md",
  "docs/MOLENKOPF_USAGE.md",
  "docs/MOLENKOPF_PLUGIN_API.md",
  "docs/PRODUCT_INTENT.md",
  "docs/THREAT_MODEL.md",
  "molenkopf.config.example.json",
  "README.md",
  "LICENSE",
  "SECURITY.md"
];
const approvedTarballPaths = [
  /^bin\/[^/]+\.js$/,
  /^packages\/core\/src\/.+\.ts$/,
  /^packages\/proxy\/src\/.+\.ts$/,
  /^packages\/plugins\/[^/]+\/.+\.(ts|html)$/,
  /^packages\/dashboard\/dist\/.+/,
  /^packages\/dashboard\/public\/molenkopf-logo\.png$/,
  /^docs\/[^/]+\.md$/
];
const exactTarballPaths = new Set([".env.example", "package.json", "README.md", "LICENSE", "SECURITY.md", "molenkopf.config.example.json"]);
const forbiddenPatterns = [
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.molenkopf(\/|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)auth\.json$/i,
  /(^|\/).+\.(?:db|sqlite|log)$/i,
  /(^|\/).+\.db-(?:wal|shm)$/i,
  /(^|\/)(?:credentials?|secrets?)(?:\.[^.]+)?$/i
];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const failures = packageFailures(pkg, packInventory(root), root);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("package contents ok");
}

export function packageFailures(manifest, tarballPaths, baseDir = root) {
  const listed = new Set(manifest.files ?? []);
  const failures = [];
  for (const file of requiredFiles) if (!existsSync(join(baseDir, file))) failures.push(`missing required package file: ${file}`);
  for (const file of requiredFiles) if (!isWhitelisted(file, listed)) failures.push(`package files does not include: ${file}`);
  for (const item of listed) if (isForbidden(item)) failures.push(`unsafe package files entry: ${item}`);
  for (const path of tarballPaths) {
    if (isForbidden(path)) failures.push(`unsafe tarball path: ${path}`);
    if (!isApprovedTarballPath(path)) failures.push(`unexpected tarball path: ${path}`);
  }
  for (const file of requiredFiles) if (!tarballPaths.includes(file)) failures.push(`tarball omits required file: ${file}`);
  return failures;
}

function isWhitelisted(file, entries) {
  return [...entries].some((entry) => entry.endsWith("/") ? file.startsWith(entry) : file === entry);
}

function isApprovedTarballPath(path) {
  return exactTarballPaths.has(path) || approvedTarballPaths.some((pattern) => pattern.test(path));
}

function isForbidden(path) {
  if (path === ".env.example") return false;
  return forbiddenPatterns.some((pattern) => pattern.test(path));
}

function packInventory(cwd) {
  const output = runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"], cwd).toString("utf8");
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0].files)) throw new Error("invalid npm pack inventory");
  return result[0].files.map((file) => file.path);
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return execFileSync(process.execPath, [npmCli, ...args], { cwd, stdio: "pipe" });
  return execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, stdio: "pipe", shell: process.platform === "win32" });
}
