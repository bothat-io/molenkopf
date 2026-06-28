import { IdentityStore } from "../../core/src/identity/identity-store.ts";
import { AuditStore } from "../../core/src/manifest/audit-store.ts";

export async function seedUsageIdentity(dataDir: string): Promise<void> {
  const seed = new IdentityStore(dataDir);
  await seed.load();
  await seed.putTeam({ id: "alpha", name: "Alpha", allowedProviders: "*", managerIds: [], createdAt: "x" });
  await seed.putUser({ id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"], createdAt: "x" });
  seed.data.keys.key_a = { id: "key_a", hash: "a".repeat(64), prefix: "mk_fake", ownerUserId: "bob", teamId: "alpha", project: "project-alpha", createdAt: "x" };
  await seed.save();
  seed.close();
}

export async function writeUsageAudit(dataDir: string, requestId: string, inputTokens: number, outputTokens: number): Promise<void> {
  await new AuditStore(dataDir).write({
    requestId, timestamp: "2026-06-23T00:00:00.000Z", method: "POST", path: "/v1/messages", targetHost: "api.test", providerId: "default",
    client: { id: "user:bob", label: "Bob", source: "api_key", userId: "bob", teamIds: ["alpha"], keyId: "key_a", project: "project-alpha" },
    compressedItems: 0, estimatedOriginalTokens: 0, estimatedCompressedTokens: 0, estimatedSavedTokens: 0,
    redactedSecrets: 0, retrievalIds: [], compressorsUsed: [], warnings: [], statusCode: 200, durationMs: 1,
    upstreamInputTokens: inputTokens, upstreamOutputTokens: outputTokens
  });
}
