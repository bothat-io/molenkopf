import { redactSecrets } from "../security/secret-redactor.ts";
import type { AuditManifest } from "./audit-store.ts";

export function normalizedManifest(manifest: AuditManifest): AuditManifest {
  const safe = JSON.parse(JSON.stringify(manifest)) as AuditManifest;
  if (!isAuditManifest(safe)) throw new Error("invalid audit manifest");
  safe.requestId = safeName(safe.requestId);
  if (Number.isNaN(Date.parse(safe.timestamp))) safe.timestamp = new Date().toISOString();
  safe.targetHost = safeToken(redactSecrets(safe.targetHost).text, "target");
  safe.method = safe.method.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 12) || "GET";
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
    && typeof item.redactedSecrets === "number" && Array.isArray(item.retrievalIds) && Array.isArray(item.compressorsUsed)
    && Array.isArray(item.warnings));
}

function safeClient(client: NonNullable<AuditManifest["client"]>): NonNullable<AuditManifest["client"]> {
  const safe = { ...client, id: safeToken(client.id, "client"), label: safeToken(redactSecrets(client.label).text, client.source) };
  if (client.userId) safe.userId = safeToken(client.userId, "user");
  if (client.agentId) safe.agentId = safeToken(client.agentId, "agent");
  if (client.teamIds) safe.teamIds = client.teamIds.map((id) => safeToken(id, "team")).slice(0, 50);
  if (client.keyId) safe.keyId = safeToken(client.keyId, "key");
  if (client.project) safe.project = safeToken(client.project, "project");
  return safe;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._:-]/gi, "_").slice(0, 96) || "request";
}

function safeToken(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-z0-9._:@/-]/gi, "_").slice(0, 96);
  return cleaned || fallback;
}

function safeWarning(value: string): string {
  const cleaned = value.replace(/[^a-z0-9._:@/ -]/gi, "_").replace(/\s+/g, " ").trim().slice(0, 160);
  return cleaned || "warning";
}
