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

test("source completeness reports a missing Dockerfile without throwing", async () => {
  const root = await fixtureRoot(["packages/dashboard/dist/", "bin/"], { dockerfile: false });
  try {
    assert.ok(sourceCompletenessFailures(root).includes("Dockerfile missing"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source completeness checks JS and TS relative import forms", async () => {
  const root = await fixtureRoot(["bin/"]);
  try {
    await mkdir(join(root, "packages", "core", "src", "lib"), { recursive: true });
    await writeFile(join(root, "packages", "core", "src", "lib", "index.ts"), "export const ok = true;\n");
    await writeFile(join(root, "scripts", "tool.js"), [
      importText("const a = require('", "../packages/core/src/lib", "');"),
      importText("import('", "../packages/core/src/lib/index.ts", "');"),
      importText("export { ok } from '", "../packages/core/src/lib/index.ts", "';")
    ].join("\n"));
    await writeFile(join(root, "bin", "runner.js"), importText("import '", "../scripts/tool.js", "';\n"));

    assert.deepEqual(sourceCompletenessFailures(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source completeness rejects missing and wrong-case relative imports", async () => {
  const root = await fixtureRoot(["bin/"]);
  try {
    await mkdir(join(root, "packages", "core", "src"), { recursive: true });
    await writeFile(join(root, "packages", "core", "src", "Thing.ts"), "export const ok = true;\n");
    await writeFile(join(root, "scripts", "bad.js"), [
      importText("import '", "../packages/core/src/thing.ts", "';"),
      importText("require('", "./missing.js", "');")
    ].join("\n"));

    const failures = sourceCompletenessFailures(root);
    assert.ok(failures.includes("scripts/bad.js: missing relative import ../packages/core/src/thing.ts"));
    assert.ok(failures.includes("scripts/bad.js: missing relative import ./missing.js"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixtureRoot(files, options = { dockerfile: true }) {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-source-check-"));
  if (options.dockerfile) await writeFile(join(root, "Dockerfile"), "");
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "bin", "molenkopf.js"), "");
  await mkdir(join(root, "packages", "dashboard", "public"), { recursive: true });
  await writeFile(join(root, "packages", "dashboard", "public", "molenkopf-logo.png"), "");
  await writeFile(join(root, "packages", "dashboard", "public", "favicon.png"), "");
  await writeFile(join(root, "packages", "dashboard", "public", "favicon.ico"), "");
  await writeFile(join(root, "package.json"), JSON.stringify({ bin: { molenkopf: "bin/molenkopf.js" }, files }));
  return root;
}

function importText(before, specifier, after) {
  return `${before}${specifier}${after}`;
}
