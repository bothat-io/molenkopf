import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entries = [
  "packages/proxy/src/cli/main.ts",
  "packages/proxy/src/cli/profile-server.ts",
  "packages/proxy/src/http/server.ts",
  "packages/core/src/plugins/plugin-catalog.ts"
];
const required = [
  "packages/proxy/src/http/local-api.ts",
  "packages/proxy/src/http/local-api-provider-actions.ts",
  "packages/proxy/src/http/local-api-plugin-actions.ts",
  "packages/plugins/context-compressor-plugin/plugin.ts",
  "packages/plugins/obsidian-graph-plugin/plugin.ts",
  "packages/plugins/shared/audit-projects.ts"
];
const compatibilityRoutes = new Map([
  ["/__molenkopf/users", "deprecated compatibility alias for identity user listing/creation; successor: /__molenkopf/identity"]
]);
const retainedUtilities = new Map([
  ["packages/core/src/profiles/profile-router.ts", "retained core routing utility covered by profile-router tests, not a proxy production entry"]
]);

const reachable = new Set();
for (const entry of entries) visit(resolve(root, entry));
const routes = routeLiterals(readFileSync(resolve(root, "packages/proxy/src/http/local-api.ts"), "utf8"));
const missing = required.filter((item) => !reachable.has(toKey(resolve(root, item))));
const staleCompatibility = [...compatibilityRoutes.keys()].filter((route) => !routes.includes(route));
const missingRetained = [...retainedUtilities.keys()].filter((item) => !existsSync(resolve(root, item)));

console.log("Molenkopf reachability report");
console.log(`entryPoints=${entries.length}`);
console.log(`reachableTsFiles=${reachable.size}`);
console.log(`localApiRoutes=${routes.length}`);
for (const [route, note] of compatibilityRoutes) console.log(`compatibilityRoute=${route} :: ${note}`);
for (const [file, note] of retainedUtilities) console.log(`retainedUtility=${file} :: ${note}`);

if (missing.length || staleCompatibility.length || missingRetained.length) {
  for (const item of missing) console.error(`missingReachable=${item}`);
  for (const item of staleCompatibility) console.error(`missingCompatibilityRoute=${item}`);
  for (const item of missingRetained) console.error(`missingRetainedUtility=${item}`);
  process.exit(1);
}

function visit(file) {
  const key = toKey(file);
  if (reachable.has(key) || !existsSync(file) || statSync(file).isDirectory()) return;
  reachable.add(key);
  const text = readFileSync(file, "utf8");
  for (const spec of importSpecs(text)) {
    if (!spec.startsWith(".")) continue;
    const resolved = resolveImport(dirname(file), spec);
    if (resolved) visit(resolved);
  }
}

function importSpecs(text) {
  return [...text.matchAll(/\bimport(?:\s+type)?[\s\S]*?\sfrom\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)]
    .map((match) => match[1] ?? match[2])
    .filter(Boolean);
}

function resolveImport(base, spec) {
  const raw = resolve(base, spec);
  for (const candidate of candidates(raw)) if (existsSync(candidate)) return candidate;
  return undefined;
}

function candidates(raw) {
  const list = [raw, `${raw}.ts`, `${raw}.js`];
  if (existsSync(raw) && statSync(raw).isDirectory()) list.push(join(raw, "index.ts"));
  return list;
}

function routeLiterals(text) {
  return [...new Set([...text.matchAll(/["'](\/__molenkopf\/[^"']*)["']/g)].map((match) => match[1]))].sort();
}

function toKey(file) {
  return normalize(relative(root, file)).replace(/\\/g, "/");
}
