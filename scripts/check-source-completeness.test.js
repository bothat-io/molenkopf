import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sourceCompletenessFailures } from "./check-source-completeness.js";

test("source completeness does not require generated dashboard dist in a clean checkout", async () => {
  const root = await fixtureRoot(["packages/dashboard/dist/", "bin/"]);
  try {
    assert.deepEqual(sourceCompletenessFailures(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source completeness still rejects missing non-generated package files", async () => {
  const root = await fixtureRoot(["packages/dashboard/dist/", "missing-runtime/"]);
  try {
    assert.ok(sourceCompletenessFailures(root).includes("package.json files entry missing: missing-runtime/"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixtureRoot(files) {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-source-check-"));
  await writeFile(join(root, "Dockerfile"), "");
  await mkdir(join(root, "bin"), { recursive: true });
  await writeFile(join(root, "bin", "molenkopf.js"), "");
  await mkdir(join(root, "packages", "dashboard", "public"), { recursive: true });
  await writeFile(join(root, "packages", "dashboard", "public", "molenkopf-logo.png"), "");
  await writeFile(join(root, "packages", "dashboard", "public", "favicon.png"), "");
  await writeFile(join(root, "package.json"), JSON.stringify({ bin: { molenkopf: "bin/molenkopf.js" }, files }));
  return root;
}
