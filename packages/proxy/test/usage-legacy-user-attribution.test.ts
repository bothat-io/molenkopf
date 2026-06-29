import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditStore, type AuditManifest } from "../../core/src/manifest/audit-store.ts";
import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { UsageSnapshotStore } from "../../core/src/identity/usage-snapshot.ts";
import { startProxy } from "../src/http/server.ts";
import { safeSubjectId } from "../src/http/client-identity.ts";
import { setupAdmin } from "./proxy-auth-utils.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

test("restore maps audit-safe user ids back to known identity users", async () => {
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-legacy-user-"));
  const userId = "bob@example.com";
  const safeUser = safeSubjectId(userId);
  const timestamp = "2026-06-29T20:30:00.000Z";
  const totals = { requests: 1, inputTokens: 9, outputTokens: 4, costEur: 0 };

  const identity = new IdentityStore(dataDir);
  await identity.load();
  await identity.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await identity.putUser({ id: userId, displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  await identity.save();
  identity.close();

  await new AuditStore(dataDir).write(legacyManifest({ timestamp, safeUser }));
  const snapshots = new UsageSnapshotStore(dataDir);
  await snapshots.save({
    usageByAgent: {},
    usageByProvider: { default: totals },
    usageByKey: { key_old: totals },
    usageByTeam: { alpha: totals },
    usageByUser: { [`user:${userId}`]: { requests: 1, inputTokens: 0, outputTokens: 0, costEur: 0 } },
    usageSnapshotCursor: `${timestamp}\u0000legacy-safe-user`
  });
  await snapshots.close();

  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
  try {
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie: admin } }).then((r) => r.json());
    const user = usage.users.find((item: any) => item.id === userId);
    assert.equal(user.usage.inputTokens, 9);
    assert.equal(user.usage.outputTokens, 4);
  } finally {
    await proxy.close();
    upstream.close();
  }
});

function legacyManifest({ timestamp, safeUser }: { timestamp: string; safeUser: string }): AuditManifest {
  return {
    requestId: "legacy-safe-user", timestamp, method: "POST", path: "/v1/responses", targetHost: "api.test", providerId: "default",
    client: { id: `user:${safeUser}`, label: "key:key_old", source: "api_key", userId: safeUser, teamIds: ["alpha"], keyId: "key_old", project: "legacy" },
    compressedItems: 0, estimatedOriginalTokens: 0, estimatedCompressedTokens: 0, estimatedSavedTokens: 0,
    redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [], statusCode: 200, durationMs: 1,
    upstreamInputTokens: 9, upstreamOutputTokens: 4
  };
}
