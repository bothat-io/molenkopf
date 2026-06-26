import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const root = process.cwd();
const failures = [];
const pkg = readJson("package.json");

checkDockerfileCopies();
checkPackageFiles();
checkBin();
checkRelativeTsImports();
checkDashboardPublicAssets();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("source completeness ok");

function checkDockerfileCopies() {
  const text = read("Dockerfile");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("COPY ") || trimmed.includes("--from=")) continue;
    const parts = trimmed.split(/\s+/).slice(1);
    const sources = parts.slice(0, -1);
    for (const source of sources) {
      if (!exists(source)) failures.push(`Dockerfile COPY source missing: ${source}`);
    }
  }
}

function checkPackageFiles() {
  for (const entry of pkg.files ?? []) {
    const path = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (!exists(path)) failures.push(`package.json files entry missing: ${entry}`);
  }
}

function checkBin() {
  const bin = pkg.bin?.molenkopf;
  if (typeof bin !== "string" || !exists(bin)) failures.push("package.json bin.molenkopf target missing");
}

function checkRelativeTsImports() {
  for (const file of sourceFiles("packages")) {
    const text = read(file);
    for (const specifier of relativeImports(text)) {
      if (!resolvesImport(dirname(file), specifier)) failures.push(`${file}: missing relative import ${specifier}`);
    }
  }
}

function checkDashboardPublicAssets() {
  const publicDir = "packages/dashboard/public";
  if (!isDir(publicDir)) failures.push(`${publicDir} missing`);
  for (const asset of ["packages/dashboard/public/molenkopf-logo.png"]) {
    if (!exists(asset)) failures.push(`dashboard public asset missing: ${asset}`);
  }
}

function relativeImports(text) {
  return [...text.matchAll(/(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g)].map((match) => match[1]);
}

function resolvesImport(baseDir, specifier) {
  const target = join(baseDir, specifier);
  if (extname(target)) return exists(target);
  return [".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx"].some((suffix) => exists(`${target}${suffix}`));
}

function sourceFiles(dir) {
  if (!exists(dir)) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return generated(path) ? [] : sourceFiles(path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function generated(path) {
  return path.includes("/dist/") || path.includes("/node_modules/");
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function exists(path) {
  return existsSync(resolve(root, path));
}

function isDir(path) {
  return exists(path) && statSync(resolve(root, path)).isDirectory();
}
