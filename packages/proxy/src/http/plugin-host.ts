import type { AuditManifest } from "../../../core/src/manifest/audit-store.ts";
import type { EventBus, MolenkopfEvent } from "../../../core/src/events/event-bus.ts";
import { builtinPluginModules } from "../../../core/src/plugins/builtin-plugin-modules.ts";
import type { MolenkopfPluginModule, PluginActionContext, PluginDataContext, PluginJson, PluginLifecycleContext, PluginRuntimeContext } from "../../../core/src/plugins/plugin-api.ts";
import type { RetrievalStore } from "../../../core/src/store/retrieval-store.ts";
import { isPluginEnabled, type RuntimeState } from "./runtime-state.ts";
import { safePluginOutput } from "./plugin-output-safety.ts";

type Modules = Record<string, MolenkopfPluginModule>;
type HookName = "onBoot" | "onStart" | "onEnable" | "onDisable" | "onStop";
type DataResult = { ok: true; payload: PluginJson } | { ok: false; status: number; error: string };

export type PluginHost = {
  boot: () => Promise<void>;
  start: (port?: number) => Promise<void>;
  enable: (id: string) => Promise<void>;
  disable: (id: string) => Promise<void>;
  stop: (reason?: string) => Promise<void>;
  audit: (manifest: AuditManifest, pluginIds?: readonly string[]) => Promise<void>;
  data: (id: string, ctx: PluginDataContext) => Promise<DataResult>;
  action: (id: string, actionId: string, input: Record<string, unknown>, userId?: string, teamIds?: readonly string[]) => Promise<DataResult>;
  setRequestPlugins: (requestId: string, pluginIds: readonly string[]) => void;
};

export function createPluginHost(state: RuntimeState, deps: { store: RetrievalStore; events: EventBus }, modules: Modules = builtinPluginModules): PluginHost {
  const booted = new Set<string>(), started = new Set<string>();
  const requestPlugins = new Map<string, Set<string>>();
  let unsubscribe: (() => void) | undefined;
  let eventQueue = Promise.resolve();
  const runtime = (id: string): PluginRuntimeContext => ({ pluginId: id, dataDir: state.dataDir, storage: deps.store, now: () => new Date() });
  const lifecycle = (id: string, hook: HookName, port?: number, reason?: string): PluginLifecycleContext => ({
    pluginId: id, dataDir: state.dataDir, port, reason, now: () => new Date(),
    note: (message) => deps.events.emit("plugin_event", { data: safePluginOutput(id, { pluginId: id, hook, message }, "strict") as Record<string, unknown> })
  });
  async function run(id: string, hook: HookName, port?: number, reason?: string): Promise<boolean> {
    const fn = modules[id]?.[hook];
    if (!fn) { setLifecycle(id, hook); return true; }
    try { await fn(lifecycle(id, hook, port, reason), runtime(id)); setLifecycle(id, hook); return true; } catch (error) { failLifecycle(id, hook, error); warn(deps.events, id, hook); return false; }
  }
  async function eachEnabled(task: (id: string) => Promise<void>, allowed?: ReadonlySet<string>): Promise<void> {
    for (const id of Object.keys(modules)) if (isPluginEnabled(state, id) && (!allowed || allowed.has(id))) await task(id);
  }
  return {
    async boot() {
      for (const id of Object.keys(modules)) if (await run(id, "onBoot")) booted.add(id);
    },
    async start(port) {
      unsubscribe = deps.events.subscribe((event) => { if (event.type !== "plugin_event") eventQueue = eventQueue.then(() => notifyEvent(event)).catch(() => {}); });
      await eachEnabled(async (id) => { if (await run(id, "onStart", port)) started.add(id); });
    },
    async enable(id) {
      if (await run(id, "onEnable", state.port)) started.add(id);
    },
    async disable(id) {
      await run(id, "onDisable", state.port);
      started.delete(id);
    },
    async stop(reason = "server_close") {
      unsubscribe?.();
      for (const id of new Set([...booted, ...started])) await run(id, "onStop", state.port, reason);
    },
    async audit(manifest, pluginIds) {
      await eachEnabled(async (id) => {
        const fn = modules[id]?.onAudit;
        if (fn) try {
          await fn({
            requestId: manifest.requestId,
            providerId: manifest.providerId ?? "",
            statusCode: manifest.statusCode ?? 0,
            manifest: manifest as unknown as PluginJson,
            note: (message) => deps.events.emit("plugin_event", { data: safePluginOutput(id, { pluginId: id, hook: "onAudit", message }, "strict") as Record<string, unknown> })
          }, runtime(id));
        } catch { warn(deps.events, id, "onAudit"); }
      }, pluginSet(pluginIds));
    },
    async data(id, ctx) {
      const fn = modules[id]?.getData;
      if (!fn) return { ok: false, status: 404, error: "plugin_data_not_found" };
      try { return { ok: true, payload: await fn(ctx, runtime(id)) }; } catch { warn(deps.events, id, "getData"); return { ok: false, status: 500, error: "plugin_data_failed" }; }
    },
    async action(id, actionId, input, userId, teamIds = []) {
      const fn = modules[id]?.executeAction;
      if (!fn) return { ok: false, status: 404, error: "plugin_action_not_found" };
      try {
        const context: PluginActionContext = { actionId, input: input as PluginJson, userId, teamIds: [...teamIds], scope: "local-api" };
        return { ok: true, payload: await fn(context, runtime(id)) };
      } catch {
        warn(deps.events, id, `action:${actionId}`);
        return { ok: false, status: 500, error: "plugin_action_failed" };
      }
    },
    setRequestPlugins(requestId, pluginIds) {
      requestPlugins.set(requestId, new Set(pluginIds));
    }
  };
  async function notifyEvent(event: MolenkopfEvent): Promise<void> {
    const allowed = event.requestId ? requestPlugins.get(event.requestId) : undefined;
    await eachEnabled(async (id) => {
      const fn = modules[id]?.onEvent;
    if (fn) try { await fn({ event: event.type, data: (event.data ?? {}) as PluginJson, emit: (name, data) => deps.events.emit("plugin_event", { data: safePluginOutput(id, { pluginId: id, event: name, ...data }, "strict") as Record<string, unknown> }) }, runtime(id)); } catch { warn(deps.events, id, "onEvent"); }
    }, allowed);
    if (event.requestId && (event.type === "request_finished" || event.type === "request_failed")) requestPlugins.delete(event.requestId);
  }
  function setLifecycle(id: string, hook: HookName): void {
    const status = hook === "onDisable" ? "disabled" : hook === "onStop" ? "stopped" : hook === "onBoot" ? "booted" : "enabled";
    state.pluginLifecycle[id] = { status, hook };
  }
  function failLifecycle(id: string, hook: string, _error: unknown): void {
    state.pluginLifecycle[id] = { status: "error", hook, error: "plugin_hook_failed" };
  }
}

function pluginSet(pluginIds: readonly string[] | undefined): ReadonlySet<string> | undefined {
  return pluginIds ? new Set(pluginIds) : undefined;
}

function warn(events: EventBus, pluginId: string, hook: string): void {
  events.emit("warning", { data: { warning: "plugin_hook_failed", pluginId, hook, error: "plugin_hook_failed" } });
}
