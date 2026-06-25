import type { IncomingMessage, ServerResponse } from "node:http";
import { findPlugin } from "../../../core/src/plugins/plugin-catalog.ts";
import { pluginView } from "./local-api-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import type { PluginHost } from "./plugin-host.ts";
import type { RuntimeState } from "./runtime-state.ts";

export async function togglePlugin(req: IncomingMessage, res: ServerResponse, state: RuntimeState, pluginHost?: PluginHost) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const plugin = findPlugin(id);
  if (!plugin) return writeJson(res, 404, { error: "unknown_plugin" });
  if (typeof body.enabled !== "boolean") return writeJson(res, 400, { error: "invalid_enabled" });
  state.pluginEnabled[id] = body.enabled;
  state.pluginUpdatedAt[id] = new Date().toISOString();
  await persistRuntimeSettings(state);
  if (pluginHost) await (body.enabled ? pluginHost.enable(id) : pluginHost.disable(id));
  writeJson(res, 200, pluginView(plugin, state));
}
