import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";
import { resolveClientIdentity } from "../src/http/proxy-identity.ts";

test("legacy everyone API keys do not widen team provider access", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-team-policy-"));
  const store = new IdentityStore(dir);
  try {
    await store.load();
    await store.putTeam({ id: "everyone", name: "Everyone", allowedProviders: "*", managerIds: [], createdAt: "x" });
    await store.putTeam({ id: "alpha", name: "Alpha", allowedProviders: ["default"], managerIds: [], createdAt: "x" });
    await store.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
    const issued = (await issueApiKey(store, "bob", { project: "project-alpha", teamId: "alpha" }))!;
    store.data.keys[issued.view.id].teamId = "everyone";
    const legacyEveryone = resolveClientIdentity(store, new Headers({ authorization: `Bearer ${issued.secret}` })).client;
    assert.deepEqual(legacyEveryone.teamIds, ["alpha"]);
    assert.deepEqual(legacyEveryone.allowedProviderIds, ["default"]);

    delete store.data.keys[issued.view.id].teamId;
    const legacyUntyped = resolveClientIdentity(store, new Headers({ authorization: `Bearer ${issued.secret}` })).client;
    assert.deepEqual(legacyUntyped.teamIds, ["alpha"]);
    assert.deepEqual(legacyUntyped.allowedProviderIds, ["default"]);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("last-used persistence failures are absorbed during key auth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-key-touch-"));
  const store = new IdentityStore(dir);
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    await store.load();
    await store.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
    await store.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
    const issued = (await issueApiKey(store, "bob", { project: "project-alpha", teamId: "alpha" }))!;
    store.data.keys[issued.view.id].lastUsedAt = "2000-01-01T00:00:00.000Z";
    store.save = async () => { throw new Error("disk full"); };
    assert.equal(resolveClientIdentity(store, new Headers({ authorization: `Bearer ${issued.secret}` })).keyOk, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener("unhandledRejection", listener);
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
