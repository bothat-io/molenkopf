import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { defaultDataDir } from "../../core/src/storage/local-paths.ts";
import { ensurePrivateDir, writePrivateFile } from "../../core/src/storage/private-state.ts";
import { safePluginStorageInput } from "../../core/src/plugins/plugin-storage-safety.ts";
import type { ProjectGraph } from "./types.ts";

const PLUGIN_ID = "project-graph-plugin";

export async function saveProjectGraph(dataDir: string | undefined, graph: ProjectGraph): Promise<void> {
  const safe = safePluginStorageInput(PLUGIN_ID, "global", graph);
  if (!safe.ok) throw new Error(`unsafe_project_graph_storage:${safe.errors.join(",")}`);
  const dir = await graphDir(dataDir);
  await writePrivateFile(graphPathIn(dir, graph.rootId), JSON.stringify(safe.value, null, 2));
  await saveLatestGraphRef(dataDir, graph.rootId, graph.projectId, graph.generatedAt);
}

export async function loadProjectGraph(dataDir: string | undefined, rootId: string): Promise<ProjectGraph | undefined> {
  if (!isSafeRootId(rootId)) return undefined;
  try {
    const dir = await graphDir(dataDir);
    const value = JSON.parse(await readFile(graphPathIn(dir, rootId), "utf8")) as unknown;
    return isProjectGraph(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function loadLatestProjectGraph(dataDir: string | undefined): Promise<ProjectGraph | undefined> {
  const latest = await loadLatestGraphRef(dataDir);
  return latest?.rootId ? loadProjectGraph(dataDir, latest.rootId) : undefined;
}

export async function listProjectGraphs(dataDir: string | undefined): Promise<Array<{ rootId: string; projectId: string; generatedAt: string; stats: Record<string, number> }>> {
  try {
    const dir = await graphDir(dataDir);
    const files = await readdir(dir);
    const graphs = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => loadProjectGraph(dataDir, file.slice(0, -5))));
    return graphs.filter((graph): graph is ProjectGraph => Boolean(graph)).map((graph) => ({
      rootId: graph.rootId,
      projectId: graph.projectId,
      generatedAt: graph.generatedAt,
      stats: graph.stats
    }));
  } catch {
    return [];
  }
}

export async function deleteProjectGraph(dataDir: string | undefined, rootId: string): Promise<boolean> {
  if (!isSafeRootId(rootId)) return false;
  try {
    const dir = await graphDir(dataDir);
    await rm(graphPathIn(dir, rootId), { force: true });
    const latest = await loadLatestGraphRef(dataDir);
    if (latest?.rootId === rootId) await rm(latestPath(dataDir), { force: true });
    return true;
  } catch {
    return false;
  }
}

async function saveLatestGraphRef(dataDir: string | undefined, rootId: string, projectId: string, generatedAt: string): Promise<void> {
  const value = { rootId, projectId, generatedAt };
  const safe = safePluginStorageInput(PLUGIN_ID, "global", value);
  if (!safe.ok) throw new Error(`unsafe_project_graph_latest:${safe.errors.join(",")}`);
  await ensurePrivateDir(storageRoot(dataDir));
  await writePrivateFile(latestPath(dataDir), JSON.stringify(safe.value, null, 2));
}

async function loadLatestGraphRef(dataDir: string | undefined): Promise<{ rootId: string } | undefined> {
  try {
    const value = JSON.parse(await readFile(latestPath(dataDir), "utf8")) as { rootId?: unknown };
    return typeof value.rootId === "string" && isSafeRootId(value.rootId) ? { rootId: value.rootId } : undefined;
  } catch {
    return undefined;
  }
}

async function graphDir(dataDir: string | undefined): Promise<string> {
  const dir = join(storageRoot(dataDir), "graphs");
  await ensurePrivateDir(dir);
  return dir;
}

function storageRoot(dataDir: string | undefined): string {
  return join(dataDir ?? defaultDataDir(), "plugins", PLUGIN_ID);
}

function latestPath(dataDir: string | undefined): string {
  return join(storageRoot(dataDir), "latest.json");
}

function graphPathIn(dir: string, rootId: string): string {
  return join(dir, `${rootId}.json`);
}

function isSafeRootId(value: string): boolean {
  return /^root_[a-f0-9]{16}$/.test(value);
}

function isProjectGraph(value: unknown): value is ProjectGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as ProjectGraph;
  return graph.schemaVersion === 1
    && typeof graph.projectId === "string"
    && typeof graph.rootId === "string"
    && isSafeRootId(graph.rootId)
    && typeof graph.generatedAt === "string"
    && Array.isArray(graph.nodes)
    && Array.isArray(graph.edges)
    && Boolean(graph.stats && typeof graph.stats === "object")
    && Array.isArray(graph.warnings);
}
