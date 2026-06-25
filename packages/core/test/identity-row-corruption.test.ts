import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityStore } from "../src/identity/identity-store.ts";
import type { ApiKey, Team, User } from "../src/identity/types.ts";

async function seed(): Promise<{ root: string; dbPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-identity-rows-"));
  const store = new IdentityStore(root);
  await store.load();
  store.data.teams.everyone = team("everyone", { managerIds: ["admin"] });
  store.data.users.admin = user("admin", { role: "admin", teamIds: ["everyone"], password: { salt: "s", hash: "h" } });
  store.data.keys.key_1 = key("key_1", "admin", "everyone");
  store.data.orgBudget = { period: "month", onExceed: "warn", tokenLimit: 1000 };
  store.data.pricing = { openai: { inPerMTok: 1, outPerMTok: 2 } };
  await store.save();
  store.close();
  return { root, dbPath: join(root, "molenkopf.db") };
}

test("identity row corruption fails closed across users teams keys and meta", async () => {
  const cases: [string, (db: DatabaseSync) => void][] = [
    ["invalid user json", (db) => db.prepare("UPDATE users SET json = ? WHERE id = 'admin'").run("{bad")],
    ["user id mismatch", (db) => db.prepare("UPDATE users SET json = ? WHERE id = 'admin'").run(JSON.stringify(user("root", { role: "admin" })))],
    ["missing user field", (db) => db.prepare("UPDATE users SET json = ? WHERE id = 'admin'").run(JSON.stringify({ id: "admin", role: "admin" }))],
    ["missing team manager", (db) => db.prepare("UPDATE teams SET json = ? WHERE id = 'everyone'").run(JSON.stringify(team("everyone", { managerIds: ["ghost"] })))],
    ["missing key owner", (db) => db.prepare("UPDATE api_keys SET json = ? WHERE id = 'key_1'").run(JSON.stringify(key("key_1", "ghost", "everyone")))],
    ["invalid meta budget", (db) => db.prepare("UPDATE meta SET json = ? WHERE k = 'orgBudget'").run(JSON.stringify({ period: "hour", onExceed: "warn" }))]
  ];
  for (const [name, mutate] of cases) await assertFailsClosed(name, mutate);
});

test("identity load succeeds again after explicit row repair and marker removal", async () => {
  const { root, dbPath } = await seed();
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE users SET json = ? WHERE id = 'admin'").run("{bad");
  db.close();
  await assert.rejects(new IdentityStore(root).load(), /invalid identity data/);
  assert.equal(existsSync(join(root, "molenkopf.db.quarantined")), true);

  await unlink(join(root, "molenkopf.db.quarantined"));
  const repair = new DatabaseSync(dbPath);
  repair.prepare("UPDATE users SET json = ? WHERE id = 'admin'").run(JSON.stringify(user("admin", { role: "admin", teamIds: ["everyone"], password: { salt: "s", hash: "h" } })));
  repair.close();

  const recovered = new IdentityStore(root);
  await recovered.load();
  assert.equal(recovered.getUser("admin")?.role, "admin");
  recovered.close();
  await rm(root, { recursive: true, force: true });
});

test("identity load accepts email user ids after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-identity-email-"));
  const store = new IdentityStore(root);
  await store.load();
  store.data.teams.everyone = team("everyone", { managerIds: ["admin@example.test"] });
  store.data.users["admin@example.test"] = user("admin@example.test", { role: "admin", teamIds: ["everyone"], password: { salt: "s", hash: "h" } });
  store.data.keys.key_1 = key("key_1", "admin@example.test", "everyone");
  await store.save();
  store.close();

  const restored = new IdentityStore(root);
  await restored.load();
  assert.equal(restored.getUser("admin@example.test")?.role, "admin");
  assert.equal(existsSync(join(root, "molenkopf.db.quarantined")), false);
  restored.close();
  await rm(root, { recursive: true, force: true });
});

async function assertFailsClosed(name: string, mutate: (db: DatabaseSync) => void): Promise<void> {
  const { root, dbPath } = await seed();
  const db = new DatabaseSync(dbPath);
  mutate(db);
  db.close();
  await assert.rejects(new IdentityStore(root).load(), /invalid identity data/, name);
  assert.equal(existsSync(join(root, "molenkopf.db.quarantined")), true, name);
  await assert.rejects(new IdentityStore(root).load(), /quarantined database marker/, name);
  await rm(root, { recursive: true, force: true });
}

function user(id: string, extra: Partial<User> = {}): User {
  return { id, displayName: id, role: "member", teamIds: [], createdAt: "2026-06-21T00:00:00.000Z", ...extra };
}

function team(id: string, extra: Partial<Team> = {}): Team {
  return { id, name: id, allowedProviders: "*", managerIds: [], createdAt: "2026-06-21T00:00:00.000Z", ...extra };
}

function key(id: string, ownerUserId: string, teamId: string): ApiKey {
  return { id, hash: "h", prefix: "mk_x", ownerUserId, teamId, project: "p", createdAt: "2026-06-21T00:00:00.000Z" };
}
