import type { AuditManifest, AuditStore } from "../../../core/src/manifest/audit-store.ts";
import type { EventBus } from "../../../core/src/events/event-bus.ts";
import type { RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";
import type { UsageTotals } from "../../../core/src/manifest/usage-meter.ts";
import { recordUsage } from "./usage-accounting.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { safeSubjectId, type ClientIdentity } from "./client-identity.ts";
import type { PluginHost } from "./plugin-host.ts";
import type { RequestModelMetadata } from "./request-model.ts";

export async function finishRequest(manifest: AuditManifest, auditStore: AuditStore, events: EventBus, state: RuntimeState, pluginHost?: PluginHost, pluginIds?: readonly string[]): Promise<void> {
  const stored = auditSafeManifest(manifest);
  await auditStore.write(stored);
  state.requests++;
  state.compressedItems += manifest.compressedItems;
  recordUsage(state, manifest);
  state.latest = stored;
  if (pluginIds) pluginHost?.setRequestPlugins(manifest.requestId, pluginIds);
  await pluginHost?.audit(stored, pluginIds);
  events.emit("request_finished", { requestId: manifest.requestId, data: { statusCode: manifest.statusCode, durationMs: manifest.durationMs } });
}

export async function finishProxyRequest(input: {
  auditStore: AuditStore;
  events: EventBus;
  state: RuntimeState;
  pluginHost?: PluginHost;
  pluginIds?: readonly string[];
  requestId: string;
  method: string;
  path: string;
  target: string;
  providerId: string;
  started: number;
  client: ClientIdentity;
  statusCode: number;
  audit?: RewriteAudit;
  usage?: UsageTotals;
  requestModel?: RequestModelMetadata;
  timings?: Record<string, number>;
}): Promise<void> {
  const manifest = buildManifest(input.requestId, input.method, input.path, input.target, input.providerId, input.statusCode, Date.now() - input.started, input.client, input.audit, input.usage, input.requestModel, input.timings);
  await finishRequest(manifest, input.auditStore, input.events, input.state, input.pluginHost, input.pluginIds);
}

export function buildManifest(requestId: string, method: string, path: string, target: string, providerId: string, statusCode: number, durationMs: number, client: ClientIdentity, audit?: RewriteAudit, usage?: UsageTotals, requestModel?: RequestModelMetadata, timings?: Record<string, number>): AuditManifest {
  return {
    requestId, timestamp: new Date().toISOString(), method, path, targetHost: new URL(target).host, providerId,
    requestedModel: requestModel?.model,
    requestedReasoning: requestModel?.reasoning,
    client,
    compressedItems: audit?.compressedItems ?? 0,
    estimatedOriginalTokens: audit?.estimatedOriginalTokens ?? 0,
    estimatedCompressedTokens: audit?.estimatedCompressedTokens ?? 0,
    estimatedSavedTokens: audit?.estimatedSavedTokens ?? 0,
	    redactedSecrets: audit?.redactedSecrets ?? 0,
	    retrievalIds: audit?.retrievalIds ?? [],
	    compressorsUsed: [...new Set(audit?.compressorsUsed ?? [])],
	    warnings: audit?.warnings ?? [], statusCode, durationMs,
	    compressionCandidates: audit?.compressionCandidates, compressionSkipped: audit?.compressionSkipped, skipReasons: audit?.skipReasons, contentKindCounts: audit?.contentKindCounts,
	    originalBytes: audit?.originalBytes, forwardedBytes: audit?.forwardedBytes, compressionRatio: audit?.compressionRatio,
	    potentialCompressedItems: audit?.potentialCompressedItems, potentialSavedTokens: audit?.potentialSavedTokens, potentialSavedBytes: audit?.potentialSavedBytes,
	    protectedSourceTokens: audit?.protectedSourceTokens, protectedDiffTokens: audit?.protectedDiffTokens,
	    contentFingerprints: audit?.contentFingerprints,
	    effectivePluginIds: audit?.effectivePluginIds, compressorMode: audit?.compressorMode, zeroSavingsReasons: audit?.zeroSavingsReasons,
	    staticPrefixHash: audit?.staticPrefixHash, toolSchemaHash: audit?.toolSchemaHash, cacheablePrefixBytes: audit?.cacheablePrefixBytes, hasTimestampNoise: audit?.hasTimestampNoise, hasRandomIdNoise: audit?.hasRandomIdNoise,
	    toolCount: audit?.toolCount, toolSchemaBytes: audit?.toolSchemaBytes, toolSchemaTokens: audit?.toolSchemaTokens,
	    upstreamInputTokens: usage?.inputTokens,
    upstreamOutputTokens: usage?.outputTokens,
    cachedTokens: usage?.cachedTokens,
    cacheReadTokens: usage?.cacheReadTokens,
    cacheCreationTokens: usage?.cacheCreationTokens,
    reasoningTokens: usage?.reasoningTokens,
    timings
  };
}

function auditSafeManifest(manifest: AuditManifest): AuditManifest {
  return { ...manifest, client: manifest.client ? auditSafeClient(manifest.client) : undefined };
}

function auditSafeClient(client: NonNullable<AuditManifest["client"]>): AuditManifest["client"] {
  return {
    ...client,
    id: safeClientId(client.id),
    label: safeClientLabel(client),
    userId: client.userId ? safeSubjectId(client.userId) : undefined,
    agentId: client.agentId ? safeSubjectId(client.agentId) : undefined
  };
}

function safeClientId(id: string): string {
  const [prefix, ...rest] = id.split(":");
  const value = rest.join(":");
  return value ? `${prefix}:${safeSubjectId(value)}` : safeSubjectId(id);
}

function safeClientLabel(client: NonNullable<AuditManifest["client"]>): string {
  if (client.source === "api_key" && client.keyId) return `key:${client.keyId}`;
  return client.label.includes(":") ? safeClientId(client.label) : safeSubjectId(client.label);
}
