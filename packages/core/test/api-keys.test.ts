import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityStore } from "../src/identity/identity-store.ts";
import { authenticateKey, issueApiKey, listKeys, revokeKey } from "../src/identity/api-keys.ts";
import type { User } from "../src/identity/types.ts";

async function storeWithUser(): Promise<IdentityStore> {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-keys-"));
  const s = new IdentityStore(root);
  await s.load();
  const u: User = { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "2026-06-21T00:00:00.000Z" };
  await s.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "2026-06-21T00:00:00.000Z" });
  await s.putUser(u);
  return s;
}

test("issuing a key returns the secret once and stores only a hash", async () => {
  const s = await storeWithUser();
  const issued = await issueApiKey(s, "bob", { agentLabel: "ci-bot", project: "project-alpha/main", teamId: "alpha" });
  assert.ok(issued, "key issued");
  assert.ok(issued!.secret.startsWith("mk_"), "secret has mk_ prefix");
  const stored = s.data.keys[issued!.view.id];
  assert.ok(stored.hash && stored.hash !== issued!.secret, "stored hash is not the plaintext");
  assert.equal((stored as any).secret, undefined, "no plaintext field persisted");
  assert.equal(listKeys(s, "bob")[0].id, issued!.view.id);
  assert.equal(listKeys(s, "bob")[0].project, "project-alpha/main");
  assert.equal(listKeys(s, "bob")[0].teamId, "alpha");
  assert.equal((listKeys(s, "bob")[0] as any).hash, undefined, "views never expose the hash");
});

test("authenticate matches the right secret and rejects wrong/disabled/unknown", async () => {
  const s = await storeWithUser();
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha" }))!;
  assert.equal(authenticateKey(s, issued.secret)?.ownerUserId, "bob", "valid secret resolves owner");
  assert.equal(authenticateKey(s, "mk_wrong"), undefined, "wrong secret rejected");
  assert.equal(authenticateKey(s, undefined), undefined, "missing secret rejected");

  assert.equal(await revokeKey(s, issued.view.id), true);
  assert.equal(authenticateKey(s, issued.secret), undefined, "revoked key no longer authenticates");
  assert.equal(await revokeKey(s, issued.view.id), false, "double-revoke is a no-op");
});

test("malformed stored key hashes fail closed without crashing authentication", async () => {
  const s = await storeWithUser();
  s.data.keys.bad_short = { id: "bad_short", hash: "abc", prefix: "mk_bad", ownerUserId: "bob", teamId: "alpha", project: "project-alpha", createdAt: "x" };
  s.data.keys.bad_hex = { id: "bad_hex", hash: "z".repeat(64), prefix: "mk_bad", ownerUserId: "bob", teamId: "alpha", project: "project-alpha", createdAt: "x" };
  assert.equal(authenticateKey(s, "mk_anything"), undefined);
});

test("issue and revoke roll back in-memory mutations when persistence fails", async () => {
  const s = await storeWithUser();
  const originalSave = s.save.bind(s);
  s.save = async () => { throw new Error("disk full"); };
  await assert.rejects(issueApiKey(s, "bob", { project: "project-alpha", teamId: "alpha" }), /disk full/);
  assert.deepEqual(Object.keys(s.data.keys), []);

  s.save = originalSave;
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha", teamId: "alpha" }))!;
  s.save = async () => { throw new Error("disk full"); };
  await assert.rejects(revokeKey(s, issued.view.id), /disk full/);
  assert.equal(s.data.keys[issued.view.id].disabled, undefined);
});

test("issued key scopes must be valid provider identifiers", async () => {
  const s = await storeWithUser();
  assert.equal(await issueApiKey(s, "bob", { project: "project-alpha", teamId: "alpha", scopes: ["valid", "bad scope"] }), undefined);
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha", teamId: "alpha", scopes: ["default", "default", "openai-env"] }))!;
  assert.deepEqual(s.data.keys[issued.view.id].scopes, ["default", "openai-env"]);
});

test("cannot issue a key for an unknown user", async () => {
  const s = await storeWithUser();
  assert.equal(await issueApiKey(s, "ghost", { project: "project-alpha" }), undefined);
  assert.equal(await issueApiKey(s, "bob", { project: "" }), undefined);
});

test("keys require an active owner and unambiguous valid team", async () => {
  const s = await storeWithUser();
  const inferred = (await issueApiKey(s, "bob", { project: "project-alpha" }))!;
  assert.equal(inferred.view.teamId, "alpha", "single owner team is inferred");
  s.getUser("bob")!.disabled = true;
  assert.equal(authenticateKey(s, inferred.secret), undefined, "disabled owner rejected");
  s.getUser("bob")!.disabled = false;
  await s.putTeam({ id: "beta", name: "Beta", allowedProviders: "*", managerIds: [], createdAt: "x" });
  s.getUser("bob")!.teamIds.push("beta");
  assert.equal(await issueApiKey(s, "bob", { project: "project-alpha" }), undefined, "multi-team owner needs explicit team");
  const explicit = (await issueApiKey(s, "bob", { project: "project-alpha", teamId: "beta" }))!;
  assert.equal(explicit.view.teamId, "beta");
  delete s.data.users.bob;
  assert.equal(authenticateKey(s, explicit.secret), undefined, "missing owner rejected");
});

test("default everyone team does not make key team selection ambiguous", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-keys-everyone-"));
  const s = new IdentityStore(root);
  await s.load();
  await s.putTeam({ id: "everyone", name: "Everyone", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await s.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await s.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });

  assert.deepEqual(s.getUser("bob")?.teamIds, ["everyone", "alpha"]);
  const inferred = (await issueApiKey(s, "bob", { project: "project-alpha" }))!;
  assert.equal(inferred.view.teamId, "alpha");

  await s.putTeam({ id: "beta", name: "Beta", allowedProviders: "*", managerIds: [], createdAt: "x" });
  s.getUser("bob")!.teamIds.push("beta");
  assert.equal(await issueApiKey(s, "bob", { project: "project-alpha" }), undefined);
});

test("issued key survives a store reload", async () => {
  const s = await storeWithUser();
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha" }))!;
  const reopened = new IdentityStore((s as any).root);
  await reopened.load();
  assert.equal(authenticateKey(reopened, issued.secret)?.id, issued.view.id);
});

test("keys without a project do not authenticate", async () => {
  const s = await storeWithUser();
  const issued = (await issueApiKey(s, "bob", { project: "project-alpha" }))!;
  delete s.data.keys[issued.view.id].project;
  await s.save();
  const reopened = new IdentityStore((s as any).root);
  await reopened.load();
  assert.equal(authenticateKey(reopened, issued.secret), undefined);
});
