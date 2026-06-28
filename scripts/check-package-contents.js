import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const pluginDescriptors = discoverPluginDescriptors(root);
const requiredFiles = [
  ".env.example",
  "bin/molenkopf.js",
  "bin/launcher.js",
  "packages/core/src/security/secret-redactor.ts",
  "packages/proxy/src/cli/main.ts",
  ...requiredPluginFiles(pluginDescriptors),
  "packages/plugins/shared/audit-projects.ts",
  "packages/dashboard/dist/index.html",
  "packages/dashboard/public/molenkopf-logo.png",
  "packages/dashboard/public/favicon.png",
  "docs/DEPLOYMENT.md",
  "docs/PLUGIN_DEVELOPMENT.md",
  "docs/PLUGIN_POLICY.md",
  "docs/MOLENKOPF_USAGE.md",
  "docs/MOLENKOPF_PLUGIN_API.md",
  "docs/PRODUCT_INTENT.md",
  "docs/assets/dashboard-overview.png",
  "docs/plugins/context-compressor-plugin.md",
  "docs/plugins/token-optimizer-plugin.md",
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
  /^packages\/dashboard\/public\/favicon\.png$/,
  /^docs\/assets\/[^/]+\.png$/,
  /^docs\/[^/]+\.md$/,
  /^docs\/plugins\/[^/]+\.md$/
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

function requiredPluginFiles(descriptors) {
  return descriptors.flatMap((descriptor) => {
    const files = [descriptor.descriptorPath];
    if (descriptor.modulePath) files.push(descriptor.modulePath);
    if (descriptor.hasPage) files.push(descriptor.pagePath);
    return files;
  });
}

function discoverPluginDescriptors(baseDir) {
  const pluginsRoot = join(baseDir, "packages", "plugins");
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(pluginsRoot, entry.name, "descriptor-v2.ts")))
    .map((entry) => {
      const descriptorPath = `packages/plugins/${entry.name}/descriptor-v2.ts`;
      const text = readFileSync(join(baseDir, descriptorPath), "utf8");
      const modulePath = capture(text, /modulePath:\s*"([^"]+)"/);
      const pagePath = capture(text, /pagePath:\s*"([^"]+)"/);
      return {
        id: capture(text, /id:\s*"([^"]+)"/) ?? entry.name,
        descriptorPath,
        modulePath: modulePath ? `packages/plugins/${entry.name}/${modulePath}` : undefined,
        hasPage: Boolean(pagePath),
        pagePath: pagePath ? `packages/plugins/${entry.name}/page.html` : undefined
      };
    });
}

function capture(text, pattern) {
  return text.match(pattern)?.[1];
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
