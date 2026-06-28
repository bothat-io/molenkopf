import { lstatSync, readdirSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { join, relative, sep } from "node:path";
import { isAllowedExtension, isDeniedPath, isPathInsideRoot, rootIdForPath, safeDisplayPath, validateProjectRoot } from "./path-policy.ts";
import type { DiscoveryResult, ProjectGraphSettings, ProjectFile, ScanWarning } from "./types.ts";

type FsOps = { readDir: (dir: string) => string[]; lstat: (path: string) => Stats; stat: (path: string) => Stats };
const nodeFs: FsOps = { readDir: readdirSync, lstat: lstatSync, stat: statSync };

export function discoverProjectFiles(rootPath: string, policy: ProjectGraphSettings, fs: FsOps = nodeFs): DiscoveryResult {
  const warnings = validateProjectRoot(rootPath);
  const files: ProjectFile[] = [];
  const deniedPaths: string[] = [];
  let skipped = 0;
  if (warnings.length) return { rootPath, rootId: rootIdForPath(rootPath), files, skipped, deniedPaths, warnings };
  walk(rootPath, rootPath, 0, policy, files, deniedPaths, warnings, () => skipped++, fs);
  return { rootPath, rootId: rootIdForPath(rootPath), files, skipped, deniedPaths: deniedPaths.slice(0, 100), warnings };
}

function walk(root: string, dir: string, depth: number, policy: ProjectGraphSettings, files: ProjectFile[], denied: string[], warnings: ScanWarning[], skip: () => void, fs: FsOps): void {
  if (files.length >= policy.maxFiles) return void warnings.push({ code: "max_files_reached" });
  if (depth > policy.maxDepth) return void warnings.push({ code: "max_depth_reached", path: safeDisplayPath(root, dir) });
  for (const entry of safeReadDir(dir, warnings, root, fs)) {
    const absolutePath = join(dir, entry);
    if (!isPathInsideRoot(root, absolutePath)) { denied.push(entry); skip(); continue; }
    const rel = relative(root, absolutePath).split(sep).join("/");
    if (isDeniedPath(rel, policy)) { denied.push(rel); skip(); continue; }
    const link = safeStatEntry("lstat_failed", absolutePath, rel, warnings, skip, fs.lstat);
    if (!link) continue;
    if (link.isSymbolicLink() && !policy.followSymlinks) { skip(); continue; }
    const stat = safeStatEntry("stat_failed", absolutePath, rel, warnings, skip, fs.stat);
    if (!stat) continue;
    if (stat.isDirectory()) walk(root, absolutePath, depth + 1, policy, files, denied, warnings, skip, fs);
    else if (shouldScanFile(rel, stat.size, policy)) files.push({ absolutePath, relativePath: rel, bytes: stat.size });
    else skip();
    if (files.length >= policy.maxFiles) break;
  }
}

export function shouldScanFile(relativePath: string, bytes: number, policy: ProjectGraphSettings): boolean {
  return bytes <= policy.maxFileBytes && isAllowedExtension(relativePath, policy) && !isDeniedPath(relativePath, policy);
}

function safeReadDir(dir: string, warnings: ScanWarning[], root: string, fs: FsOps): string[] {
  try { return fs.readDir(dir); } catch {
    warnings.push({ code: "read_dir_failed", path: safeDisplayPath(root, dir) });
    return [];
  }
}

function safeStatEntry(code: string, absolutePath: string, path: string, warnings: ScanWarning[], skip: () => void, stat: (path: string) => Stats) {
  try { return stat(absolutePath); } catch {
    warnings.push({ code, path });
    skip();
    return undefined;
  }
}
