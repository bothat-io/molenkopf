import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleProjectGraphAction } from "../../plugins/project-graph-plugin/actions.ts";
import { startProxy } from "../src/http/server.ts";
import { setupAdmin } from "./proxy-auth-utils.ts";

test("project graph scan.preview returns safe file metadata only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "project-graph-action-"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "route.ts"), "app.get('/secret', handler)\n");
  const result = await handleProjectGraphAction({
    actionId: "scan.preview",
    input: { rootPath: dir, maxFiles: 10 },
    scope: "local-api",
    teamIds: []
  }, { pluginId: "project-graph-plugin", now: () => new Date() });
  assert.equal(result.filesFound, 1);
  assert.equal(result.filesSkipped, 0);
  assert.deepEqual(result.sampleFiles, [{ path: "src/route.ts", bytes: 28 }]);
  assert.equal(Object.hasOwn(result, "source"), false);
});

test("project graph scan.run builds an in-memory queryable graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "project-graph-run-"));
  const dataDir = await mkdtemp(join(tmpdir(), "project-graph-data-"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "index.ts"), "export function makeGraph() { return 'hidden'; }\n");
  const runtime = { pluginId: "project-graph-plugin", dataDir, now: () => new Date() };
  const scan = await handleProjectGraphAction({ actionId: "scan.run", input: { rootPath: dir, mode: "manual" }, scope: "local-api", teamIds: [] }, runtime);
  assert.equal((scan.stats as Record<string, number>).symbols, 1);
  const query = await handleProjectGraphAction({ actionId: "graph.query", input: { query: "make", limit: 5 }, scope: "local-api", teamIds: [] }, runtime);
  assert.ok((query.results as unknown[]).length >= 1);
  const stored = await readFile(join(dataDir, "plugins", "project-graph-plugin", "graphs", `${scan.rootId}.json`), "utf8");
  assert.doesNotMatch(stored, /hidden/);
  assert.doesNotMatch(stored, /\{\s*return/);
});

test("project graph works through generic plugin action and data routes", async () => {
  const root = await mkdtemp(join(tmpdir(), "project-graph-route-root-"));
  const dataDir = await mkdtemp(join(tmpdir(), "project-graph-route-data-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "api.ts"), "export function apiThing() { return 'never-store'; }\n");
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);

    const scan = await post(base, "/__molenkopf/plugins/project-graph-plugin/actions/scan.run", { input: { rootPath: root, mode: "manual" } }, admin);
    assert.equal(scan.status, 200);
    const scanJson = await scan.json() as { rootId: string; stats: Record<string, number> };
    assert.equal(scanJson.stats.symbols, 1);

    const data = await fetch(`${base}/__molenkopf/plugins/project-graph-plugin/data`, { headers: { cookie: admin } }).then((res) => res.json()) as { latestScanStatus: string; graphSummaries: unknown[] };
    assert.equal(data.latestScanStatus, "scanned");
    assert.equal(data.graphSummaries.length, 1);

    const query = await post(base, "/__molenkopf/plugins/project-graph-plugin/actions/graph.query", { input: { query: "apiThing", limit: 5 } }, admin);
    assert.equal(query.status, 200);
    assert.ok(((await query.json()) as { results: unknown[] }).results.length >= 1);

    const stored = await readFile(join(dataDir, "plugins", "project-graph-plugin", "graphs", `${scanJson.rootId}.json`), "utf8");
    assert.doesNotMatch(stored, /never-store|\{\s*return/);
  } finally {
    if (proxy) await proxy.close();
    await rm(root, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
});

function post(base: string, path: string, body: unknown, cookie = "") {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}
