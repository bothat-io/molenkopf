import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProjectFiles } from "../../plugins/project-graph-plugin/file-discovery.ts";
import { defaultPolicy, isDeniedPath, isPathInsideRoot, normalizeProjectRoot, rootIdForPath } from "../../plugins/project-graph-plugin/path-policy.ts";

test("project graph root policy validates explicit roots and stable ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "project-graph-root-"));
  const root = normalizeProjectRoot(dir);
  assert.equal(isPathInsideRoot(root, join(root, "src", "app.ts")), true);
  assert.equal(isPathInsideRoot(root, join(root, "..", "outside.ts")), false);
  assert.match(rootIdForPath(root), /^root_[a-f0-9]{16}$/);
});

test("project graph denylist blocks sensitive paths", () => {
  const policy = defaultPolicy();
  assert.equal(isDeniedPath(".git/config", policy), true);
  assert.equal(isDeniedPath(".codex/auth.json", policy), true);
  assert.equal(isDeniedPath(".docker/config.json", policy), true);
  assert.equal(isDeniedPath(".ssh/config", policy), true);
  assert.equal(isDeniedPath(".vscode/extensions/plugin/package.json", policy), true);
  assert.equal(isDeniedPath("AppData/Local/tool/config.json", policy), true);
  assert.equal(isDeniedPath(".claude/.credentials.json", policy), true);
  assert.equal(isDeniedPath("src/.env.local", policy), true);
  assert.equal(isDeniedPath("runtime-auth/auth.json", policy), true);
  assert.equal(isDeniedPath("src/index.ts", policy), false);
});

test("project graph discovery skips denied and oversized files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "project-graph-discovery-"));
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "node_modules"));
  await writeFile(join(dir, "src", "app.ts"), "export function ok() {}\n");
  await writeFile(join(dir, "src", ".env.local"), "SECRET=1\n");
  await writeFile(join(dir, "node_modules", "pkg.js"), "module.exports = 1\n");
  const result = discoverProjectFiles(normalizeProjectRoot(dir), { ...defaultPolicy(), maxFileBytes: 64 });
  assert.deepEqual(result.files.map((file) => file.relativePath), ["src/app.ts"]);
  assert.ok(result.deniedPaths.includes("src/.env.local"));
  assert.ok(result.deniedPaths.includes("node_modules"));
  assert.equal(result.warnings.length, 0);
});
