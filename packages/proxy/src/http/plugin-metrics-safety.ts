import { optionalContentFingerprints, safeContentFingerprints } from "../../../core/src/manifest/audit-fingerprints.ts";
import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";
import type { PluginContext } from "./plugin-pipeline.ts";

export function sanitizeMetricState(id: string, ctx: PluginContext): void {
  ctx.redactedSecrets = safeNumber(ctx.redactedSecrets, "redactedSecrets", id, ctx);
  ctx.compressedItems = safeNumber(ctx.compressedItems, "compressedItems", id, ctx);
  ctx.savedTokens = safeNumber(ctx.savedTokens, "savedTokens", id, ctx);
  ctx.compressionCandidates = safeOptionalNumber(ctx.compressionCandidates, "compressionCandidates", id, ctx);
  ctx.compressionSkipped = safeOptionalNumber(ctx.compressionSkipped, "compressionSkipped", id, ctx);
  ctx.originalBytes = safeOptionalNumber(ctx.originalBytes, "originalBytes", id, ctx);
  ctx.forwardedBytes = safeOptionalNumber(ctx.forwardedBytes, "forwardedBytes", id, ctx);
  ctx.compressionRatio = safeOptionalNumber(ctx.compressionRatio, "compressionRatio", id, ctx);
  ctx.potentialCompressedItems = safeOptionalNumber(ctx.potentialCompressedItems, "potentialCompressedItems", id, ctx);
  ctx.potentialSavedTokens = safeOptionalNumber(ctx.potentialSavedTokens, "potentialSavedTokens", id, ctx);
  ctx.potentialSavedBytes = safeOptionalNumber(ctx.potentialSavedBytes, "potentialSavedBytes", id, ctx);
  ctx.retrievalIds = safeStringList(ctx.retrievalIds, "retrievalIds", id, ctx, 50);
  ctx.compressorsUsed = safeStringList(ctx.compressorsUsed, "compressorsUsed", id, ctx, 20);
  ctx.skipReasons = safeCounts(ctx.skipReasons, "skipReasons", id, ctx);
  ctx.contentKindCounts = safeCounts(ctx.contentKindCounts, "contentKindCounts", id, ctx);
  if (ctx.contentFingerprints && optionalContentFingerprints(ctx.contentFingerprints)) ctx.contentFingerprints = safeContentFingerprints(ctx.contentFingerprints);
  else if (ctx.contentFingerprints) { ctx.contentFingerprints = undefined; ctx.note(`plugin_metric_rejected:${id}:contentFingerprints`); }
}

function safeNumber(value: unknown, field: string, id: string, ctx: PluginContext): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  ctx.note(`plugin_metric_rejected:${id}:${field}`);
  return 0;
}

function safeOptionalNumber(value: unknown, field: string, id: string, ctx: PluginContext): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  ctx.note(`plugin_metric_rejected:${id}:${field}`);
  return undefined;
}

function safeStringList(value: unknown, field: string, id: string, ctx: PluginContext, max: number): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.slice(0, max);
  ctx.note(`plugin_metric_rejected:${id}:${field}`);
  return [];
}

function safeCounts(value: unknown, field: string, id: string, ctx: PluginContext): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) { ctx.note(`plugin_metric_rejected:${id}:${field}`); return undefined; }
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value).slice(0, 50)) {
    if (typeof count !== "number" || !Number.isFinite(count)) { ctx.note(`plugin_metric_rejected:${id}:${field}`); continue; }
    const safeKey = redactSecrets(key).text.replace(/[^a-z0-9._:@/ -]/gi, "_").replace(/\s+/g, "_").slice(0, 80);
    if (safeKey) out[safeKey] = (out[safeKey] ?? 0) + Math.max(0, Math.trunc(count));
  }
  return out;
}
