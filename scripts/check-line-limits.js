import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function lineLimitFailures(root = process.cwd()) {
  const handwritten = sourceFiles(root).filter((file) => /\.(js|ts|tsx|md|json|yml|yaml)$/.test(file) && !generated(file));
  const failures = [];

  for (const file of handwritten) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/).length;
    if (lines > 200) failures.push(`${file}: ${lines} lines`);
  }

  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = lineLimitFailures();
  if (failures.length) {
    console.error("handwritten file line limit exceeded");
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log("line limits ok");
}

function generated(file) {
  return file.endsWith("package-lock.json") ||
    file.startsWith("docs/MOLENKOPF_EXECUTION_PACKAGES") ||
    file.includes("/dist/") ||
    file.startsWith("node_modules/") ||
    file.includes("/node_modules/") ||
    file.startsWith(".git/") ||
    file.startsWith(".molenkopf/") ||
    file.startsWith("coverage/") ||
    file.startsWith("cypress/screenshots/") ||
    file.startsWith("cypress/videos/") ||
    file.startsWith("packages/dashboard/cypress/screenshots/") ||
    file.startsWith("packages/dashboard/cypress/videos/");
}

function sourceFiles(root) {
  const tracked = gitLsFiles(root);
  return tracked ?? walk(root, "");
}

function gitLsFiles(root) {
  try {
    return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split(/\r?\n/).filter(Boolean);
  } catch (error) {
    const message = `${error.stderr ?? ""}${error.message ?? ""}`;
    if (!message.includes("dubious ownership")) return undefined;
    return execFileSync("git", ["-c", `safe.directory=${root}`, "ls-files"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  }
}

function walk(root, dir) {
  const fullDir = join(root, dir);
  if (!existsSync(fullDir)) return [];
  const files = [];
  for (const entry of readdirSync(fullDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (generated(`${path}${entry.isDirectory() ? "/" : ""}`)) continue;
    if (entry.isDirectory()) files.push(...walk(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
