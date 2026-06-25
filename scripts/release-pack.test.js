import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packRelease, parsePackResult } from "./release-pack.js";

test("packRelease ignores noisy lifecycle output and returns the tarball", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-pack-fixture-"));
  try {
    await writeFile(join(dir, "package.json"), JSON.stringify({
      name: "pack-fixture",
      version: "1.0.0",
      scripts: { prepack: "node prepack.js" },
      files: ["index.js"]
    }));
    await writeFile(join(dir, "index.js"), "export const ok = true;\n");
    await writeFile(join(dir, "prepack.js"), "console.log('noisy stdout'); console.error('noisy stderr');\n");
    const filename = packRelease(dir);
    assert.equal(filename, "pack-fixture-1.0.0.tgz");
    assert.equal(existsSync(join(dir, filename)), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parsePackResult rejects malformed pack results", () => {
  assert.throws(() => parsePackResult("{}"), /must be an array/);
  assert.throws(() => parsePackResult("[]"), /exactly one/);
  assert.throws(() => parsePackResult(JSON.stringify([{ filename: "a.tgz" }, { filename: "b.tgz" }])), /exactly one/);
  assert.throws(() => parsePackResult(JSON.stringify([{ filename: "" }])), /no filename/);
});
