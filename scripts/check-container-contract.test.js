import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { containerContractFailures } from "./check-container-contract.js";

test("container contract reports missing files as contract failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-container-contract-"));
  try {
    const failures = containerContractFailures(root);
    assert.ok(failures.includes("Dockerfile: missing required file"));
    assert.ok(failures.includes(".dockerignore: missing required file"));
    assert.ok(failures.includes("package.json: missing required file"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("container contract helper accepts the repository root", () => {
  assert.deepEqual(containerContractFailures(resolve(".")), []);
});

test("container contract still validates patterns when files exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-container-contract-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "Dockerfile"), "FROM node\n");
    await writeFile(join(root, ".dockerignore"), "node_modules\n");
    await writeFile(join(root, "package.json"), "{}\n");
    await writeFile(join(root, "scripts", "smoke-docker.js"), "console.log('x')\n");
    await writeFile(join(root, ".github", "workflows", "release.yml"), "name: release\n");
    await writeFile(join(root, ".github", "workflows", "preview.yml"), "name: preview\n");
    await writeFile(join(root, ".github", "workflows", "test.yml"), "name: test\n");

    const failures = containerContractFailures(root);
    assert.ok(failures.some((failure) => failure.startsWith("Dockerfile: missing required pattern")));
    assert.ok(!failures.some((failure) => failure.endsWith("missing required file")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
