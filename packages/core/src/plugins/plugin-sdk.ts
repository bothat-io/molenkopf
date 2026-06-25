import type { MolenkopfPluginModule } from "./plugin-api.ts";

export type PluginPermission =
  | "metadata:read"
  | "body:read"
  | "body:write"
  | "audit:read"
  | "audit:write"
  | "events:write"
  | "provider:write";

export type LocalPlugin = {
  name: string;
  permissions: PluginPermission[];
  module: MolenkopfPluginModule;
};

export function createLocalPluginRegistry() {
  const plugins = new Map<string, LocalPlugin>();
  return {
    register(plugin: LocalPlugin) {
      if (!/^[a-z0-9-]+$/.test(plugin.name)) throw new Error("invalid plugin name");
      if (plugin.permissions.length === 0) throw new Error("plugin permissions required");
      if (!hasRuntimeHook(plugin.module)) throw new Error("plugin runtime hook required");
      if (plugins.has(plugin.name)) throw new Error(`duplicate plugin: ${plugin.name}`);
      plugins.set(plugin.name, Object.freeze({ ...plugin, permissions: [...plugin.permissions] }));
    },
    registerRemote(_url: string): never {
      throw new Error("remote plugins are disabled");
    },
    get(name: string) {
      return plugins.get(name);
    },
    names() {
      return [...plugins.keys()];
    }
  };
}

function hasRuntimeHook(module: MolenkopfPluginModule): boolean {
  return Boolean(module.onBoot || module.onStart || module.onEnable || module.onDisable || module.onRequest || module.onAudit || module.onEvent || module.getData || module.onStop);
}
