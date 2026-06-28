import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeProjectRoot } from "../../plugins/project-graph-plugin/path-policy.ts";
import { discoverProjectFiles } from "../../plugins/project-graph-plugin/file-discovery.ts";
import { scanProjectFiles } from "../../plugins/project-graph-plugin/file-scan.ts";
import { buildProjectGraph } from "../../plugins/project-graph-plugin/graph-builder.ts";
import { defaultPolicy } from "../../plugins/project-graph-plugin/path-policy.ts";

test("project graph scanner extracts safe TS and JS structure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "project-graph-scan-"));
  await mkdir(join(dir, "src"));
  const helperImport = "import { helper } from './" + "helper';";
  await writeFile(join(dir, "src", "app.ts"), [
    helperImport,
    "export class Server {}",
    "export function routeSecret() { return 'do-not-store'; }",
    "app.get('/private-url', routeSecret);",
    "test('server works', () => {});",
    "bus.emit('ready');"
  ].join("\n"));
  const discovery = discoverProjectFiles(normalizeProjectRoot(dir), defaultPolicy());
  const results = scanProjectFiles(discovery.files);
  const graph = buildProjectGraph(results, { rootId: discovery.rootId, generatedAt: "2026-06-28T00:00:00.000Z" });
  assert.equal(graph.stats.files, 1);
  assert.equal(graph.stats.routes, 1);
  assert.equal(graph.stats.tests, 1);
  assert.ok(graph.nodes.some((node) => node.kind === "import" && node.label === "./helper"));
  assert.ok(graph.nodes.some((node) => node.kind === "symbol" && node.label === "Server"));
  assert.ok(graph.nodes.some((node) => node.kind === "event" && node.label === "ready"));
  assert.equal(graph.nodes.some((node) => node.safeSignature?.includes("do-not-store")), false);
});
