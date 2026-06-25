import { redactSecrets } from "../security/secret-redactor.ts";

export type PrFile = { path: string; patch: string };
export type PrContextInput = { title: string; description?: string; files: PrFile[] };
export type PrContextLimits = { maxFiles?: number; maxFieldChars?: number; maxPatchChars?: number; maxTotalChars?: number };

const DEFAULT_LIMITS = { maxFiles: 100, maxFieldChars: 500, maxPatchChars: 4000, maxTotalChars: 16000 };

export function packPrContext(input: PrContextInput, limitsInput: PrContextLimits = {}): string {
  const limits = { ...DEFAULT_LIMITS, ...limitsInput };
  if (input.files.length > limits.maxFiles) throw new Error("too_many_pr_files");
  const lines = ["# PR Context", `title: ${safeField(input.title, limits.maxFieldChars)}`];
  if (input.description) lines.push(`description: ${safeField(input.description, limits.maxFieldChars)}`);
  let omittedFiles = 0;
  for (const file of input.files) {
    const block = fileBlock(file, limits.maxPatchChars);
    if (joinedLength(lines, block) > limits.maxTotalChars) {
      omittedFiles++;
      continue;
    }
    lines.push(block);
  }
  if (omittedFiles && joinedLength(lines, omittedMarker(omittedFiles)) <= limits.maxTotalChars) lines.push(omittedMarker(omittedFiles));
  return truncate(lines.join("\n"), limits.maxTotalChars, "context");
}

export function createCiAuditArtifact(input: { requestId: string; savedTokens: number; retrievalIds: string[] }) {
  return {
    mode: "ci",
    remoteIssueIntegration: false,
    createdAt: new Date().toISOString(),
    requestId: input.requestId,
    savedTokens: input.savedTokens,
    retrievalIds: input.retrievalIds
  };
}

function fileBlock(file: PrFile, maxPatchChars: number): string {
  const patch = safePatch(file.patch, maxPatchChars);
  return `\n## ${safePath(file.path)}\n${patch}`;
}

function safeField(value: string, maxChars: number): string {
  return truncate(redactSecrets(value).text.replace(/\s+/g, " ").trim(), maxChars, "field");
}

function safePath(value: string): string {
  const redacted = redactSecrets(value).text.replace(/\\/g, "/");
  const parts = redacted.split("/").filter((part) => part && part !== "." && part !== "..");
  const normalized = parts.join("/") || "unknown";
  return truncate(normalized.replace(/[^\w .@:/\-[\]]/g, "_"), 180, "path");
}

function safePatch(value: string, maxChars: number): string {
  return truncate(redactSecrets(value).text, maxChars, "patch");
}

function truncate(value: string, maxChars: number, label: string): string {
  if (value.length <= maxChars) return value;
  const marker = `\n[molenkopf omitted: ${value.length - maxChars} ${label} chars]`;
  if (marker.length >= maxChars) return value.slice(0, Math.max(0, maxChars));
  return `${value.slice(0, maxChars - marker.length)}${marker}`;
}

function joinedLength(lines: string[], next: string): number {
  return lines.concat(next).join("\n").length;
}

function omittedMarker(count: number): string {
  return `[molenkopf omitted: ${count} files after total context limit]`;
}
