import { redactSecrets } from "../../../core/src/security/secret-redactor.ts";
import { findPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import type { MolenkopfPluginModule, PluginRequestResult } from "../../../core/src/plugins/plugin-api.ts";
import type { PluginTrafficMutation } from "../../../core/src/plugins/plugin-descriptor.ts";
import type { RetrievalStore } from "../../../core/src/store/retrieval-store.ts";
import { builtinPluginModules } from "./plugin-modules.ts";

// Plugins are middleware, but not all middleware can mutate traffic. The plugin
// descriptor is the source of truth for reads, mutations, and toggle state.

export type ConsumerUsage = { requests: number; inputTokens: number; outputTokens: number };

export type PluginContext = {
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly consumerId: string;
  providerId: string;
  body: string;
  redactedSecrets: number;
  compressedItems: number;
  savedTokens: number;
  retrievalIds: string[];
  compressorsUsed: string[];
  notes: string[];
  block?: { status: number; error: string };
  usageOf: (consumerId: string) => ConsumerUsage;
  note: (message: string) => void;
};

export type PluginMiddleware = { id: string; mutates?: PluginTrafficMutation[]; run: (ctx: PluginContext, deps: { store: RetrievalStore }) => Promise<void> | void };

export const builtinMiddlewares: PluginMiddleware[] = Object.entries(builtinPluginModules)
  .filter(([id]) => findPlugin(id)?.hooks.includes("request:body:rewrite"))
  .map(([id, module]) => middlewareFromModule(id, module));

// Runs the enabled middlewares in order. Stops early if one blocks the request.
export async function runRequestPipeline(ctx: PluginContext, enabled: (id: string) => boolean, deps: { store: RetrievalStore }, middlewares: PluginMiddleware[] = builtinMiddlewares): Promise<PluginContext> {
  runCoreRedaction(ctx);
  for (const middleware of middlewares) {
    if (!enabled(middleware.id)) continue;
    const before = snapshot(ctx);
    try { await middleware.run(ctx, deps); } catch { restore(before, ctx); ctx.note(`plugin_hook_failed:${middleware.id}`); continue; }
    enforceCapabilities(middleware, before, ctx);
    if (ctx.block) break;
  }
  return ctx;
}

export function middlewareFromModule(id: string, module: MolenkopfPluginModule): PluginMiddleware {
  return {
    id,
    async run(ctx, deps) {
      if (!module.onRequest) return;
      const result = await module.onRequest({
        requestId: ctx.requestId,
        method: ctx.method,
        path: ctx.path,
        consumerId: ctx.consumerId,
        providerId: ctx.providerId,
        body: ctx.body,
        usageOf: ctx.usageOf,
        note: ctx.note
      }, { pluginId: id, storage: deps.store, now: () => new Date() });
      if (result) applyModuleResult(ctx, result);
    }
  };
}

function applyModuleResult(ctx: PluginContext, result: PluginRequestResult): void {
  if (result.body !== undefined) ctx.body = result.body;
  if (result.providerId !== undefined) ctx.providerId = result.providerId;
  if (result.block !== undefined) ctx.block = result.block;
  if (result.redactedSecrets !== undefined) ctx.redactedSecrets += result.redactedSecrets;
  if (result.compressedItems !== undefined) ctx.compressedItems += result.compressedItems;
  if (result.savedTokens !== undefined) ctx.savedTokens += result.savedTokens;
  if (result.retrievalIds) ctx.retrievalIds.push(...result.retrievalIds);
  if (result.compressorsUsed) ctx.compressorsUsed.push(...result.compressorsUsed);
  if (result.notes) result.notes.forEach(ctx.note);
}

function runCoreRedaction(ctx: PluginContext): void {
  const redacted = redactSecrets(ctx.body);
  ctx.body = redacted.text;
  ctx.redactedSecrets += redacted.redactions.length;
}

type PipelineSnapshot = Omit<PluginContext, "usageOf" | "note">;

function snapshot(ctx: PluginContext): PipelineSnapshot {
  return { ...ctx, retrievalIds: [...ctx.retrievalIds], compressorsUsed: [...ctx.compressorsUsed], notes: [...ctx.notes], block: ctx.block ? { ...ctx.block } : undefined };
}

function enforceCapabilities(middleware: PluginMiddleware, before: PipelineSnapshot, ctx: PluginContext): void {
  const allowed = middleware.mutates ?? findPlugin(middleware.id)?.traffic.mutates ?? ["none"];
  if (ctx.body !== before.body && !canMutateBody(allowed)) return failCapability(middleware.id, "body", before, ctx);
  if (ctx.providerId !== before.providerId && !allowed.includes("route")) return failCapability(middleware.id, "route", before, ctx);
  if (blockChanged(before.block, ctx.block) && !allowed.includes("block")) return failCapability(middleware.id, "block", before, ctx);
}

function canMutateBody(allowed: PluginTrafficMutation[]): boolean {
  return allowed.includes("mask") || allowed.includes("transform") || allowed.includes("augment-context");
}

function blockChanged(before: PluginContext["block"], after: PluginContext["block"]): boolean {
  return (before?.status ?? 0) !== (after?.status ?? 0) || (before?.error ?? "") !== (after?.error ?? "");
}

function failCapability(id: string, mutation: string, before: PipelineSnapshot, ctx: PluginContext): void {
  restore(before, ctx);
  ctx.block = { status: 500, error: "plugin_capability_violation" };
  ctx.note(`plugin_capability_violation:${id}:${mutation}`);
}

function restore(before: PipelineSnapshot, ctx: PluginContext): void {
  ctx.body = before.body;
  ctx.providerId = before.providerId;
  ctx.redactedSecrets = before.redactedSecrets;
  ctx.compressedItems = before.compressedItems;
  ctx.savedTokens = before.savedTokens;
  ctx.retrievalIds = [...before.retrievalIds];
  ctx.compressorsUsed = [...before.compressorsUsed];
  ctx.notes = [...before.notes];
  ctx.block = before.block ? { ...before.block } : undefined;
}
