import { existsSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ProjectGraphSettings, ScanWarning } from "./types.ts";

const DENIED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage", ".molenkopf", "credentials", "secrets", "screenshots"]);
const DENIED_FILES = [/^\.env(?:\.|$)/i, /^auth\.json$/i, /\.(?:db|sqlite|pem|key|p12|log)$/i];

export function normalizeProjectRoot(inputPath: unknown): string {
  if (typeof inputPath !== "string" || !inputPath.trim()) throw new Error("invalid_root");
  return realpathSync(resolve(inputPath));
}

export function validateProjectRoot(rootPath: string): ScanWarning[] {
  if (!isAbsolute(rootPath) || !existsSync(rootPath)) return [{ code: "root_missing" }];
  if (!statSync(rootPath).isDirectory()) return [{ code: "root_not_directory" }];
  const denied = isDeniedPath(rootPath, defaultPolicy());
  return denied ? [{ code: "root_denied", path: safePath(rootPath) }] : [];
}

export function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const rel = relative(rootPath, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function isDeniedPath(relativePath: string, _policy: ProjectGraphSettings): boolean {
  const clean = relativePath.replaceAll("\\", "/");
  const parts = clean.split("/").filter(Boolean);
  return parts.some((part) => DENIED_SEGMENTS.has(part)) || DENIED_FILES.some((pattern) => pattern.test(parts.at(-1) ?? clean));
}

export function isAllowedExtension(path: string, policy: ProjectGraphSettings): boolean {
  const lower = path.toLowerCase();
  return policy.includeExtensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

export function safeDisplayPath(rootPath: string, absolutePath: string): string {
  return relative(rootPath, absolutePath).split(sep).join("/").slice(0, 260);
}

export function rootIdForPath(rootPath: string): string {
  return `root_${createHash("sha256").update(rootPath).digest("hex").slice(0, 16)}`;
}

export function defaultPolicy(): ProjectGraphSettings {
  return { includeExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"], excludePatterns: [], maxFiles: 5000, maxFileBytes: 524288, maxDepth: 32, followSymlinks: false };
}

function safePath(path: string): string {
  return path.split(sep).filter(Boolean).slice(-3).join("/");
}
