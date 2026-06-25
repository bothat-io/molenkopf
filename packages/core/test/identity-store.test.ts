import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityStore } from "../src/identity/identity-store.ts";
import type { Team, User } from "../src/identity/types.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "molenkopf-identity-"));
}
function user(id: string, extra: Partial<User> = {}): User {
  return { id, displayName: id, role: "member", teamIds: [], createdAt: "2026-06-21T00:00:00.000Z", ...extra };
}
function team(id: string, extra: Partial<Team> = {}): Team {
  return { id, name: id, allowedProviders: "*", managerIds: [], createdAt: "2026-06-21T00:00:00.000Z", ...extra };
}

test("identity store persists and reloads across restarts", async () => {
  const root = await tempRoot();
  const a = new IdentityStore(root);
  await a.load();
  await a.putTeam(team("alpha"));
  await a.putUser(user("bob", { teamIds: ["alpha"] }));

  const b = new IdentityStore(root);
  await b.load();
  assert.equal(b.getUser("bob")?.teamIds[0], "alpha");
  assert.equal(b.getTeam("alpha")?.name, "alpha");
  assert.deepEqual(b.usersInTeam("alpha").map((u) => u.id), ["bob"]);
});

test("removing a user removes their keys; removing a team detaches members", async () => {
  const root = await tempRoot();
  const s = new IdentityStore(root);
  await s.load();
  await s.putTeam(team("alpha"));
  await s.putUser(user("bob", { teamIds: ["alpha"] }));
  s.data.keys["key_1"] = { id: "key_1", hash: "h", prefix: "mk_x", ownerUserId: "bob", createdAt: "x" };
  await s.save();

  assert.equal(await s.removeUser("bob"), true);
  assert.equal(s.data.keys["key_1"], undefined, "owned key removed with user");

  await s.putUser(user("carol", { teamIds: ["alpha"] }));
  s.data.keys["key_2"] = { id: "key_2", hash: "h2", prefix: "mk_y", ownerUserId: "carol", teamId: "alpha", createdAt: "x" };
  assert.equal(await s.removeTeam("alpha"), true);
  assert.deepEqual(s.getUser("carol")?.teamIds, [], "team membership detached");
  assert.equal(s.data.keys["key_2"].disabled, true, "team-bound key disabled with team removal");
});

test("corrupt database file is quarantined and fails closed", async () => {
  const root = await tempRoot();
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "molenkopf.db"), "this is not a sqlite database", "utf8");
  const s = new IdentityStore(root);
  await assert.rejects(s.load(), /identity database unavailable/);
  const files = await readdir(root);
  assert.ok(files.some((f) => f.startsWith("molenkopf.db.corrupt.")), "bad db quarantined");
  assert.ok(files.includes("molenkopf.db.quarantined"), "fail-closed marker written");
});
