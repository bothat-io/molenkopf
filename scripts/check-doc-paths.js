import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.cwd();
const maintainedDocs = ["README.md", "ROADMAP.md", "SECURITY.md"];
const docs = [...maintainedDocs, ...markdownFiles("docs")];
const failures = [];

for (const file of maintainedDocs) {
  const text = readText(file);
  for (const token of text.matchAll(/`([^`]+)`/g)) {
    const value = token[1].trim();
    if (isRepoPath(value) && !existsExact(value)) {
      failures.push(`${file}: missing or wrong-case path ${value}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

function markdownFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function isRepoPath(value) {
  if (!value || value.includes(" ") || value.includes("://") || value.includes("*")) return false;
  if (value.startsWith("/") || value.startsWith(".") || value.endsWith("/")) return false;
  if (value.includes("=") || value.includes(":")) return false;
  return /^(README|ROADMAP|SECURITY|LICENSE|Dockerfile|package(-lock)?\.json)$/.test(value)
    || /^(bin|docs|packages|scripts|\.github)\//.test(value)
    || /^packages\\/.test(value);
}

function existsExact(relativePath) {
  const parts = relativePath.split(/[\\/]+/);
  let current = root;
  for (const part of parts) {
    const entries = readdirSync(current);
    if (!entries.includes(part)) return false;
    current = join(current, part);
  }
  return true;
}
