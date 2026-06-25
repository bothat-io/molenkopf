import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { IdentityStore } from "../src/identity/identity-store.ts";

test("identity database corruption fails closed instead of starting open", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-id-db-"));
  await writeFile(join(dir, "molenkopf.db"), "not sqlite", "utf8");
  const store = new IdentityStore(dir);
  await assert.rejects(store.load(), /identity database unavailable/);
  assert.equal(existsSync(join(dir, "molenkopf.db.quarantined")), true);
  await assert.rejects(new IdentityStore(dir).load(), /quarantined database marker/);
  await rm(dir, { recursive: true, force: true });
});
