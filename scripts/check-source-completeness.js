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
  checkRelativeTsImports(root, failures);
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

function checkRelativeTsImports(root, failures) {
  for (const file of sourceFiles(root, "packages")) {
    const text = read(root, file);
    for (const specifier of relativeImports(text)) {
      if (!resolvesImport(root, dirname(file), specifier)) failures.push(`${file}: missing relative import ${specifier}`);
    }
  }
}

function checkDashboardPublicAssets(root, failures) {
  const publicDir = "packages/dashboard/public";
  if (!isDir(root, publicDir)) failures.push(`${publicDir} missing`);
  for (const asset of ["packages/dashboard/public/molenkopf-logo.png", "packages/dashboard/public/favicon.png"]) {
    if (!exists(root, asset)) failures.push(`dashboard public asset missing: ${asset}`);
  }
}

function relativeImports(text) {
  return [...text.matchAll(/(?:from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g)].map((match) => match[1]);
}

function resolvesImport(root, baseDir, specifier) {
  const target = join(baseDir, specifier);
  if (extname(target)) return exists(root, target);
  return [".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx"].some((suffix) => exists(root, `${target}${suffix}`));
}

function sourceFiles(root, dir) {
  if (!exists(root, dir)) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return generated(path) ? [] : sourceFiles(root, path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function generated(path) {
  return path.includes("/dist/") || path.includes("/node_modules/");
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
