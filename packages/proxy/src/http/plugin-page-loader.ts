import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Plugins own their pages: a plugin ships packages/plugins/<id>/page.html and the
// proxy serves it at /__molenkopf/plugins/<id>/page. The page fetches its own data
// endpoint (/__molenkopf/plugins/<id>/data) client-side, so a plugin is a real
// self-contained workspace, not a hardcoded branch in the host.

const here = dirname(fileURLToPath(import.meta.url));
const pluginsDir = join(here, "..", "..", "..", "plugins");
type CacheEntry = { html: string | null; signature: string | undefined };
const cache = new Map<string, CacheEntry>();

export function loadPluginPage(id: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) return undefined;
  return loadPluginPageFromDir(pluginsDir, id, pluginPageCacheEnabled());
}

export function loadPluginPageFromDir(root: string, id: string, cacheEnabled: boolean): string | undefined {
  const file = join(root, id, "page.html");
  if (!cacheEnabled) return readPluginPage(file).html ?? undefined;
  const key = `${root}\0${id}`;
  const signature = pageSignature(file);
  const cached = cache.get(key);
  if (cached && cached.signature === signature) return cached.html ?? undefined;
  const next = readPluginPage(file, signature);
  cache.set(key, next);
  return next.html ?? undefined;
}

export function pluginPageCacheEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MOLENKOPF_PROFILE !== "dev";
}

function readPluginPage(file: string, signature = pageSignature(file)): CacheEntry {
  try {
    return { html: readFileSync(file, "utf8"), signature };
  } catch {
    return { html: null, signature };
  }
}

function pageSignature(file: string): string | undefined {
  try {
    const stat = statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return undefined;
  }
}
