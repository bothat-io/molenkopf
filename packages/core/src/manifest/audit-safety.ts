import { redactSecrets } from "../security/secret-redactor.ts";
import type { AuditManifest } from "./audit-store.ts";

export function normalizedManifest(manifest: AuditManifest): AuditManifest {
  const safe = JSON.parse(JSON.stringify(manifest)) as AuditManifest;
  if (!isAuditManifest(safe)) throw new Error("invalid audit manifest");
  safe.requestId = safeName(redactSecrets(safe.requestId).text);
  if (Number.isNaN(Date.parse(safe.timestamp))) safe.timestamp = new Date().toISOString();
  safe.path = safePath(safe.path);
  safe.targetHost = safeToken(redactSecrets(safe.targetHost).text, "target");
  safe.method = safe.method.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 12) || "GET";
  safe.retrievalIds = safe.retrievalIds.map(safeRetrievalId).filter((item): item is string => Boolean(item)).slice(0, 50);
  safe.compressorsUsed = safe.compressorsUsed.map((item) => redactedToken(String(item), "compressor")).slice(0, 20);
  safe.warnings = safe.warnings.map((item) => safeWarning(redactSecrets(String(item)).text)).slice(0, 20);
  if (safe.client) safe.client = safeClient(safe.client);
  return safe;
}

export function isAuditManifest(value: unknown): value is AuditManifest {
  const item = value as AuditManifest;
  return Boolean(item && typeof item === "object" && typeof item.requestId === "string" && typeof item.timestamp === "string"
    && typeof item.method === "string" && typeof item.path === "string" && typeof item.targetHost === "string"
    && typeof item.compressedItems === "number" && typeof item.estimatedOriginalTokens === "number"
    && typeof item.estimatedCompressedTokens === "number" && typeof item.estimatedSavedTokens === "number"
    && typeof item.redactedSecrets === "number" && finiteOptionalNumber(item.statusCode) && finiteOptionalNumber(item.durationMs)
    && stringArray(item.retrievalIds) && stringArray(item.compressorsUsed) && stringArray(item.warnings));
}

function safeClient(client: NonNullable<AuditManifest["client"]>): NonNullable<AuditManifest["client"]> {
  const source = safeSource(client.source);
  const safe = { ...client, source, id: redactedToken(client.id, "client"), label: redactedToken(client.label, source) };
  if (client.userId) safe.userId = redactedToken(client.userId, "user");
  if (client.agentId) safe.agentId = redactedToken(client.agentId, "agent");
  if (client.teamIds) safe.teamIds = client.teamIds.map((id) => redactedToken(id, "team")).slice(0, 50);
  if (client.keyId) safe.keyId = redactedToken(client.keyId, "key");
  if (client.project) safe.project = redactedToken(client.project, "project");
  return safe;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._:-]/gi, "_").slice(0, 96) || "request";
}

function safeToken(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-z0-9._:@/-]/gi, "_").slice(0, 96);
  return cleaned || fallback;
}

function redactedToken(value: string, fallback: string): string {
  return safeToken(redactSecrets(value).text, fallback);
}

function safeSource(value: string): NonNullable<AuditManifest["client"]>["source"] {
  return value === "user" || value === "agent" || value === "api_key" || value === "unattributed" ? value : "unattributed";
}

function safePath(path: string): string {
  try {
    return new URL(path, "http://local").pathname || "/";
  } catch {
    return path.split("?")[0] || "/";
  }
}

function safeRetrievalId(value: string): string | undefined {
  const redacted = redactSecrets(value).text;
  return /^molenkopf:\/\/sha256\/[a-f0-9]{64}$/.test(redacted) ? redacted : undefined;
}

function safeWarning(value: string): string {
  const cleaned = value.replace(/[^a-z0-9._:@/ -]/gi, "_").replace(/\s+/g, " ").trim().slice(0, 160);
  return cleaned || "warning";
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function finiteOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}
