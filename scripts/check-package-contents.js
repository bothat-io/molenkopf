import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const requiredFiles = [
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
const forbiddenPatterns = [/node_modules/i, /\.molenkopf/i, /\.env/i, /\.db(?:-|$)/i, /auth\.json/i, /\.log$/i];
const listed = new Set(pkg.files ?? []);
const failures = [];

for (const file of requiredFiles) if (!existsSync(join(root, file))) failures.push(`missing required package file: ${file}`);
for (const file of requiredFiles) if (!isWhitelisted(file, listed)) failures.push(`package files does not include: ${file}`);
for (const item of listed) for (const pattern of forbiddenPatterns) if (pattern.test(item)) failures.push(`unsafe package files entry: ${item}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("package contents ok");

function isWhitelisted(file, entries) {
  return [...entries].some((entry) => entry.endsWith("/") ? file.startsWith(entry) : file === entry);
}
