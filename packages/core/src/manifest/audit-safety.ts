import { redactSecrets } from "../security/secret-redactor.ts";
import type { AuditManifest } from "./audit-store.ts";
import { optionalContentFingerprints, safeContentFingerprints } from "./audit-fingerprints.ts";

export function normalizedManifest(manifest: AuditManifest): AuditManifest {
  if (!isAuditManifest(manifest)) throw new Error("invalid audit manifest");
  const safe: AuditManifest = {
    requestId: safeName(redactSecrets(manifest.requestId).text),
    timestamp: Number.isNaN(Date.parse(manifest.timestamp)) ? new Date().toISOString() : manifest.timestamp,
    method: manifest.method.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 12) || "GET",
    path: safePath(manifest.path),
    targetHost: safeToken(redactSecrets(manifest.targetHost).text, "target"),
    compressedItems: finiteNumber(manifest.compressedItems),
    estimatedOriginalTokens: finiteNumber(manifest.estimatedOriginalTokens),
    estimatedCompressedTokens: finiteNumber(manifest.estimatedCompressedTokens),
    estimatedSavedTokens: finiteNumber(manifest.estimatedSavedTokens),
	    redactedSecrets: finiteNumber(manifest.redactedSecrets),
	    retrievalIds: manifest.retrievalIds.map(safeRetrievalId).filter((item): item is string => Boolean(item)).slice(0, 50),
	    compressorsUsed: manifest.compressorsUsed.map((item) => redactedToken(String(item), "compressor")).slice(0, 20),
	    warnings: manifest.warnings.map((item) => safeWarning(redactSecrets(String(item)).text)).slice(0, 20)
	  };
	  assignNumber(safe, "compressionCandidates", manifest.compressionCandidates);
	  assignNumber(safe, "compressionSkipped", manifest.compressionSkipped);
	  assignNumber(safe, "originalBytes", manifest.originalBytes);
	  assignNumber(safe, "forwardedBytes", manifest.forwardedBytes);
	  assignNumber(safe, "compressionRatio", manifest.compressionRatio);
	  assignNumber(safe, "potentialCompressedItems", manifest.potentialCompressedItems);
	  assignNumber(safe, "potentialSavedTokens", manifest.potentialSavedTokens);
	  assignNumber(safe, "potentialSavedBytes", manifest.potentialSavedBytes);
	  assignNumber(safe, "cachedTokens", manifest.cachedTokens);
	  assignNumber(safe, "cacheReadTokens", manifest.cacheReadTokens);
	  assignNumber(safe, "cacheCreationTokens", manifest.cacheCreationTokens);
	  assignNumber(safe, "reasoningTokens", manifest.reasoningTokens);
	  assignNumber(safe, "cacheablePrefixBytes", manifest.cacheablePrefixBytes);
	  assignNumber(safe, "toolCount", manifest.toolCount);
	  assignNumber(safe, "toolSchemaBytes", manifest.toolSchemaBytes);
	  assignNumber(safe, "toolSchemaTokens", manifest.toolSchemaTokens);
	  if (manifest.timings) safe.timings = safeTimings(manifest.timings);
	  if (manifest.contentFingerprints) safe.contentFingerprints = safeContentFingerprints(manifest.contentFingerprints);
	  if (safeHash(manifest.staticPrefixHash)) safe.staticPrefixHash = manifest.staticPrefixHash;
	  if (safeHash(manifest.toolSchemaHash)) safe.toolSchemaHash = manifest.toolSchemaHash;
	  if (typeof manifest.hasTimestampNoise === "boolean") safe.hasTimestampNoise = manifest.hasTimestampNoise;
	  if (typeof manifest.hasRandomIdNoise === "boolean") safe.hasRandomIdNoise = manifest.hasRandomIdNoise;
	  if (manifest.skipReasons) safe.skipReasons = safeCountRecord(manifest.skipReasons);
	  if (manifest.contentKindCounts) safe.contentKindCounts = safeCountRecord(manifest.contentKindCounts);
	  const statusCode = finiteOptional(manifest.statusCode);
  const durationMs = finiteOptional(manifest.durationMs);
  const upstreamInputTokens = finiteOptional(manifest.upstreamInputTokens);
  const upstreamOutputTokens = finiteOptional(manifest.upstreamOutputTokens);

  if (manifest.providerId) safe.providerId = redactedToken(text(manifest.providerId, "provider"), "provider");
  if (manifest.requestedModel) safe.requestedModel = redactedToken(text(manifest.requestedModel, "model"), "model");
  if (manifest.requestedReasoning) safe.requestedReasoning = redactedToken(text(manifest.requestedReasoning, "reasoning"), "reasoning");
  if (manifest.client) safe.client = safeClient(manifest.client);
  if (statusCode !== undefined) safe.statusCode = statusCode;
  if (durationMs !== undefined) safe.durationMs = durationMs;
  if (upstreamInputTokens !== undefined) safe.upstreamInputTokens = upstreamInputTokens;
  if (upstreamOutputTokens !== undefined) safe.upstreamOutputTokens = upstreamOutputTokens;
  return safe;
}

export function isAuditManifest(value: unknown): value is AuditManifest {
  const item = value as AuditManifest;
  return Boolean(item && typeof item === "object" && typeof item.requestId === "string" && typeof item.timestamp === "string"
    && typeof item.method === "string" && typeof item.path === "string" && typeof item.targetHost === "string"
    && typeof item.compressedItems === "number" && typeof item.estimatedOriginalTokens === "number"
	    && typeof item.estimatedCompressedTokens === "number" && typeof item.estimatedSavedTokens === "number"
	    && typeof item.redactedSecrets === "number" && finiteOptionalNumber(item.statusCode) && finiteOptionalNumber(item.durationMs)
	    && finiteOptionalNumber(item.compressionCandidates) && finiteOptionalNumber(item.compressionSkipped)
	    && finiteOptionalNumber(item.originalBytes) && finiteOptionalNumber(item.forwardedBytes) && finiteOptionalNumber(item.compressionRatio)
	    && finiteOptionalNumber(item.potentialCompressedItems) && finiteOptionalNumber(item.potentialSavedTokens) && finiteOptionalNumber(item.potentialSavedBytes)
	    && finiteOptionalNumber(item.cachedTokens) && finiteOptionalNumber(item.cacheReadTokens) && finiteOptionalNumber(item.cacheCreationTokens) && finiteOptionalNumber(item.reasoningTokens)
	    && finiteOptionalNumber(item.cacheablePrefixBytes) && finiteOptionalNumber(item.toolCount) && finiteOptionalNumber(item.toolSchemaBytes) && finiteOptionalNumber(item.toolSchemaTokens)
	    && optionalHash(item.staticPrefixHash) && optionalHash(item.toolSchemaHash) && optionalBoolean(item.hasTimestampNoise) && optionalBoolean(item.hasRandomIdNoise)
	    && optionalContentFingerprints(item.contentFingerprints)
	    && optionalTimings(item.timings)
	    && optionalCountRecord(item.skipReasons) && optionalCountRecord(item.contentKindCounts)
	    && stringArray(item.retrievalIds) && stringArray(item.compressorsUsed) && stringArray(item.warnings));
	}

function safeClient(client: NonNullable<AuditManifest["client"]>): NonNullable<AuditManifest["client"]> {
  const source = safeSource(client.source);
  const safe: NonNullable<AuditManifest["client"]> = {
    source,
    id: redactedToken(text(client.id, "client"), "client"),
    label: redactedToken(text(client.label, source), source)
  };
  if (client.userId) safe.userId = redactedToken(text(client.userId, "user"), "user");
  if (client.agentId) safe.agentId = redactedToken(text(client.agentId, "agent"), "agent");
  if (client.teamIds) safe.teamIds = client.teamIds.map((id) => redactedToken(text(id, "team"), "team")).slice(0, 50);
  if (client.keyId) safe.keyId = redactedToken(text(client.keyId, "key"), "key");
  if (client.project) safe.project = redactedToken(text(client.project, "project"), "project");
  return safe;
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._:-]/gi, "_").slice(0, 96) || "request";
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteOptional(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

function assignNumber(target: AuditManifest, key: keyof AuditManifest, value: number | undefined): void {
  if (value !== undefined) (target as Record<string, unknown>)[key] = finiteNumber(value);
}

const TIMING_KEYS = new Set(["authMs", "redactionMs", "classificationMs", "compressionMs", "retrievalWriteMs", "pluginMs", "upstreamConnectMs", "firstByteMs", "firstSseMs", "streamDurationMs", "totalMs"]);

function safeTimings(value: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (TIMING_KEYS.has(key) && Number.isFinite(item) && item >= 0) out[key] = Math.round(item);
  }
  return out;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
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

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function optionalHash(value: unknown): boolean {
  return value === undefined || safeHash(value);
}

function safeHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function optionalCountRecord(value: unknown): value is Record<string, number> {
  return value === undefined || Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item)));
}

function optionalTimings(value: unknown): value is Record<string, number> {
  return value === undefined || Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item)));
}

function safeCountRecord(value: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value).slice(0, 50)) {
    const safeKey = safeWarning(redactSecrets(key).text).replace(/ /g, "_").slice(0, 80);
    if (safeKey) out[safeKey] = finiteNumber(count);
  }
  return out;
}
