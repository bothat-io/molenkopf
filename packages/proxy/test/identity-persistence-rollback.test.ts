import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { issueApiKey } from "../../core/src/identity/api-keys.ts";
import { updateKeyHandler } from "../src/http/local-api-keys.ts";
import { putIdentityTeam } from "../src/http/local-api-identity.ts";

const admin = { id: "admin", displayName: "Admin", role: "admin" as const, teamIds: [], createdAt: "x" };

test("identity key and team updates roll back after failed persistence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-identity-rollback-"));
  const store = new IdentityStore(dir);
  try {
    await store.load();
    await store.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
    await store.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
    const issued = (await issueApiKey(store, "bob", { project: "old-project", teamId: "alpha", agentLabel: "old-agent" }))!;
    store.save = async () => { throw new Error("disk full"); };

    const keyUpdate = await call((req, res) => updateKeyHandler(req, res, { identity: store } as any, admin), { id: issued.view.id, project: "new-project", agentLabel: "new-agent", teamId: "" });
    assert.equal(keyUpdate.status, 500);
    assert.equal(store.data.keys[issued.view.id].project, "old-project");
    assert.equal(store.data.keys[issued.view.id].agentLabel, "old-agent");
    assert.equal(store.data.keys[issued.view.id].teamId, "alpha");

    const teamUpdate = await call((req, res) => putIdentityTeam(req, res, { identity: store } as any), { id: "alpha", name: "Renamed", memberIds: [] });
    assert.equal(teamUpdate.status, 500);
    assert.equal(store.data.teams.alpha.name, "Alpha");
    assert.deepEqual(store.data.users.bob.teamIds, ["alpha"]);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function call(handler: (req: any, res: any) => Promise<void>, body: unknown): Promise<{ status: number; json: any }> {
  const server = createServer((req, res) => { void handler(req, res); });
  const port = await listenOn(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  } finally {
    server.close();
  }
}

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}
