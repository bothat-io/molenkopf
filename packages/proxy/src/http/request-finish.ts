import type { AuditManifest, AuditStore } from "../../../core/src/manifest/audit-store.ts";
import type { EventBus } from "../../../core/src/events/event-bus.ts";
import type { RewriteAudit } from "../../../core/src/pipeline/openai-request-rewriter.ts";
import type { UsageTotals } from "../../../core/src/manifest/usage-meter.ts";
import { isPluginEnabled, recordUsage, type RuntimeState } from "./runtime-state.ts";
import { recordCommunicationGraph } from "./communication-graph.ts";
import { safeSubjectId, type ClientIdentity } from "./client-identity.ts";
import type { PluginHost } from "./plugin-host.ts";

export async function finishRequest(manifest: AuditManifest, auditStore: AuditStore, events: EventBus, state: RuntimeState, pluginHost?: PluginHost, pluginIds?: readonly string[]): Promise<void> {
  const stored = auditSafeManifest(manifest);
  await auditStore.write(stored);
  state.requests++;
  state.compressedItems += manifest.compressedItems;
  recordUsage(state, manifest);
  state.latest = stored;
  const pluginActive = (id: string) => pluginIds ? pluginIds.includes(id) : isPluginEnabled(state, id);
  if (pluginActive("obsidian-graph-plugin")) recordCommunicationGraph(state.communicationGraph, stored);
  if (pluginIds) pluginHost?.setRequestPlugins(manifest.requestId, pluginIds);
  await pluginHost?.audit(stored, pluginIds);
  events.emit("request_finished", { requestId: manifest.requestId, data: { statusCode: manifest.statusCode, durationMs: manifest.durationMs } });
}

export function buildManifest(requestId: string, method: string, path: string, target: string, providerId: string, statusCode: number, durationMs: number, client: ClientIdentity, audit?: RewriteAudit, usage?: UsageTotals): AuditManifest {
  return {
    requestId, timestamp: new Date().toISOString(), method, path, targetHost: new URL(target).host, providerId,
    client,
    compressedItems: audit?.compressedItems ?? 0,
    estimatedOriginalTokens: audit?.estimatedOriginalTokens ?? 0,
    estimatedCompressedTokens: audit?.estimatedCompressedTokens ?? 0,
    estimatedSavedTokens: audit?.estimatedSavedTokens ?? 0,
    redactedSecrets: audit?.redactedSecrets ?? 0,
    retrievalIds: audit?.retrievalIds ?? [],
    compressorsUsed: [...new Set(audit?.compressorsUsed ?? [])],
    warnings: audit?.warnings ?? [], statusCode, durationMs,
    upstreamInputTokens: usage?.inputTokens,
    upstreamOutputTokens: usage?.outputTokens
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
