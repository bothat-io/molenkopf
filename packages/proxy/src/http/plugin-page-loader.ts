import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Plugins own their pages: a plugin ships packages/plugins/<id>/page.html and the
// proxy serves it at /__molenkopf/plugins/<id>/page. The page fetches its own data
// endpoint (/__molenkopf/plugins/<id>/data) client-side, so a plugin is a real
// self-contained workspace, not a hardcoded branch in the host.

const here = dirname(fileURLToPath(import.meta.url));
const pluginsDir = join(here, "..", "..", "..", "plugins");
const cache = new Map<string, string | null>();

export function loadPluginPage(id: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) return undefined;
  if (!cache.has(id)) {
    try {
      cache.set(id, readFileSync(join(pluginsDir, id, "page.html"), "utf8"));
    } catch {
      cache.set(id, null);
    }
  }
  return cache.get(id) ?? undefined;
}
