import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const root = process.cwd();
const localPlanningDocs = new Set(["FIXME.md", "NEXT.md"]);
const maintainedDocs = ["README.md", "ROADMAP.md", "NEXT.md", "SECURITY.md"].filter((file) => existsExact(file));
const docs = [...maintainedDocs, ...markdownFiles("docs")];
const failures = [];

for (const file of maintainedDocs) {
  const text = readText(file);
  for (const token of text.matchAll(/`([^`]+)`/g)) {
    const value = token[1].trim();
    if (isRepoPath(value) && !existsExact(value) && !localPlanningDocs.has(value)) {
      failures.push(`${file}: missing or wrong-case path ${value}`);
    }
  }
}

for (const file of docs) {
  if (readText(file).includes("NEXT.MD")) failures.push(`${file}: use NEXT.md, not NEXT.MD`);
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
  return /^(README|ROADMAP|NEXT|SECURITY|LICENSE|Dockerfile|package(-lock)?\.json)$/.test(value)
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
