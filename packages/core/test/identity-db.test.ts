import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
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

test("locked identity databases are not renamed or permanently quarantined", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-id-db-locked-"));
  const initial = new IdentityStore(dir);
  await initial.load();
  initial.close();
  const db = new DatabaseSync(join(dir, "molenkopf.db"));
  db.exec("BEGIN EXCLUSIVE");
  try {
    const locked = new IdentityStore(dir);
    await locked.load().catch((error) => assert.match(String(error.message), /identity database unavailable/));
    locked.close();
    assert.equal(existsSync(join(dir, "molenkopf.db.quarantined")), false);
    assert.equal(existsSync(join(dir, "molenkopf.db")), true);
  } finally {
    db.exec("ROLLBACK");
    db.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
