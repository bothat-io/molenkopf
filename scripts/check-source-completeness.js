import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const generatedPackageEntries = new Set(["packages/dashboard/dist/"]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = sourceCompletenessFailures(process.cwd());
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("source completeness ok");
}

export function sourceCompletenessFailures(root = process.cwd()) {
  const failures = [];
  const pkg = readJson(root, "package.json");
  checkDockerfileCopies(root, failures);
  checkPackageFiles(root, pkg, failures);
  checkBin(root, pkg, failures);
  checkRelativeImports(root, failures);
  checkDashboardPublicAssets(root, failures);
  return failures;
}

function checkDockerfileCopies(root, failures) {
  if (!exists(root, "Dockerfile")) {
    failures.push("Dockerfile missing");
    return;
  }
  const text = read(root, "Dockerfile");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("COPY ") || trimmed.includes("--from=")) continue;
    const parts = trimmed.split(/\s+/).slice(1);
    const sources = parts.slice(0, -1);
    for (const source of sources) {
      if (!exists(root, source)) failures.push(`Dockerfile COPY source missing: ${source}`);
    }
  }
}

function checkPackageFiles(root, pkg, failures) {
  for (const entry of pkg.files ?? []) {
    if (generatedPackageEntries.has(entry)) continue;
    const path = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (!exists(root, path)) failures.push(`package.json files entry missing: ${entry}`);
  }
}

function checkBin(root, pkg, failures) {
  const bin = pkg.bin?.molenkopf;
  if (typeof bin !== "string" || !exists(root, bin)) failures.push("package.json bin.molenkopf target missing");
}

function checkRelativeImports(root, failures) {
  for (const file of sourceFiles(root)) {
    const text = read(root, file);
    for (const specifier of relativeImports(text)) {
      if (!resolvesImport(root, dirname(file), specifier)) failures.push(`${file}: missing relative import ${specifier}`);
    }
  }
}

function checkDashboardPublicAssets(root, failures) {
  const publicDir = "packages/dashboard/public";
  if (!isDir(root, publicDir)) failures.push(`${publicDir} missing`);
  for (const asset of ["packages/dashboard/public/molenkopf-logo.png", "packages/dashboard/public/favicon.png", "packages/dashboard/public/favicon.ico"]) {
    if (!exists(root, asset)) failures.push(`dashboard public asset missing: ${asset}`);
  }
}

function relativeImports(text) {
  return [
    ...matches(text, /\b(?:import|export)\s+(?:type\s+)?[^"']*?\s+from\s*["'](\.{1,2}\/[^"']+)["']/g),
    ...matches(text, /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g),
    ...matches(text, /\brequire\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g),
    ...matches(text, /\bimport\s*["'](\.{1,2}\/[^"']+)["']/g)
  ];
}

function resolvesImport(root, baseDir, specifier) {
  const target = join(baseDir, specifier);
  if (extname(target)) return existsExact(root, target);
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs", "/index.cjs", "/index.json"]
    .some((suffix) => existsExact(root, `${target}${suffix}`));
}

function sourceFiles(root) {
  return ["packages", "bin", "scripts", "test"].flatMap((dir) => sourceFilesIn(root, dir));
}

function sourceFilesIn(root, dir) {
  if (!exists(root, dir)) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return generated(path) ? [] : sourceFilesIn(root, path);
    return entry.isFile() && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

function generated(path) {
  return path.includes("/dist/") || path.includes("/node_modules/") || path.includes("/coverage/") || path.includes("/cypress/screenshots/") || path.includes("/cypress/videos/");
}

function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(root, path) {
  return JSON.parse(read(root, path));
}

function exists(root, path) {
  return existsSync(resolve(root, path));
}

function isDir(root, path) {
  return exists(root, path) && statSync(resolve(root, path)).isDirectory();
}

function existsExact(root, path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return false;
  const relative = normalizeRelative(root, absolute);
  let current = root;
  for (const segment of relative.split("/").filter(Boolean)) {
    const match = readdirSync(current, { withFileTypes: true }).find((entry) => entry.name === segment);
    if (!match) return false;
    current = join(current, segment);
  }
  return true;
}

function normalizeRelative(root, absolute) {
  return absolute.slice(resolve(root).length).replace(/^[\\/]/, "").replace(/\\/g, "/");
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}
