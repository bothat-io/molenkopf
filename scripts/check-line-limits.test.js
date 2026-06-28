import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lineLimitFailures } from "./check-line-limits.js";

test("line limit checker works outside a Git checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-line-limits-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "short.ts"), "export const ok = true;\n");
    await writeFile(join(root, "src", "long.ts"), `${Array.from({ length: 201 }, (_, i) => `line${i}`).join("\n")}\n`);
    await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(root, "node_modules", "ignored", "long.ts"), `${"x\n".repeat(250)}`);

    assert.deepEqual(lineLimitFailures(root), ["src/long.ts: 202 lines"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
