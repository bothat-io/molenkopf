import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sensitiveWorkspaceFailures } from "./check-sensitive-workspace.js";

test("sensitive workspace check allows only env example files", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-sensitive-ok-"));
  try {
    await writeFile(join(root, ".env.example"), "MOLENKOPF_SESSION_SECRET=\n");
    assert.deepEqual(sensitiveWorkspaceFailures(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sensitive workspace check rejects real root env files", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-sensitive-bad-"));
  try {
    await writeFile(join(root, ".env"), "MOLENKOPF_SESSION_SECRET=secret\n");
    await writeFile(join(root, ".env.local"), "TOKEN=secret\n");
    const failures = sensitiveWorkspaceFailures(root);
    assert.ok(failures.includes("forbidden environment file in workspace root: .env"));
    assert.ok(failures.includes("forbidden environment file in workspace root: .env.local"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
