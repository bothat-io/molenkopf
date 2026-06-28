import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleProjectGraphAction } from "../../plugins/project-graph-plugin/actions.ts";

test("project graph scan.preview returns safe file metadata only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "project-graph-action-"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "route.ts"), "app.get('/secret', handler)\n");
  const result = handleProjectGraphAction({
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
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "index.ts"), "export function makeGraph() { return 'hidden'; }\n");
  const runtime = { pluginId: "project-graph-plugin", now: () => new Date() };
  const scan = handleProjectGraphAction({ actionId: "scan.run", input: { rootPath: dir, mode: "manual" }, scope: "local-api", teamIds: [] }, runtime);
  assert.equal((scan.stats as Record<string, number>).symbols, 1);
  const query = handleProjectGraphAction({ actionId: "graph.query", input: { query: "make", limit: 5 }, scope: "local-api", teamIds: [] }, runtime);
  assert.equal((query.results as unknown[]).length, 1);
});
