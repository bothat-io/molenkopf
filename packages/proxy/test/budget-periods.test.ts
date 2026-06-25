import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageSnapshotStore } from "../../core/src/identity/usage-snapshot.ts";
import type { BudgetPeriod } from "../../core/src/identity/types.ts";
import { checkBudgets } from "../src/http/budget-gate.ts";
import { recordUsage, type RuntimeState } from "../src/http/runtime-state.ts";

const client = { id: "user:bob", label: "Bob", source: "api_key" as const, userId: "bob", teamIds: [], keyId: "key_1" };

test("budget periods reset at UTC day week and month boundaries", () => {
  const state = stateWithUserBudget("day");
  recordUsage(state, manifest("2026-06-01T23:59:00.000Z", 10));
  assert.equal(checkBudgets(state, client, new Date("2026-06-01T23:59:30.000Z")).ok, false);
  assert.deepEqual(checkBudgets(state, client, new Date("2026-06-02T00:00:00.000Z")), { ok: true, warnings: [] });

  (state.identity as any).getUser = () => ({ budget: { tokenLimit: 5, period: "week", onExceed: "block" } });
  recordUsage(state, manifest("2026-01-04T23:59:00.000Z", 10));
  assert.equal(checkBudgets(state, client, new Date("2026-01-04T23:59:30.000Z")).ok, false);
  assert.deepEqual(checkBudgets(state, client, new Date("2026-01-05T00:00:00.000Z")), { ok: true, warnings: [] });

  (state.identity as any).getUser = () => ({ budget: { tokenLimit: 5, period: "month", onExceed: "block" } });
  recordUsage(state, manifest("2026-06-30T23:59:00.000Z", 10));
  assert.equal(checkBudgets(state, client, new Date("2026-06-30T23:59:30.000Z")).ok, false);
  assert.deepEqual(checkBudgets(state, client, new Date("2026-07-01T00:00:00.000Z")), { ok: true, warnings: [] });
});

test("active budget bucket survives snapshot reload", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-budget-periods-"));
  const state = stateWithUserBudget("month");
  recordUsage(state, manifest("2026-06-15T12:00:00.000Z", 10));
  const snapshots = new UsageSnapshotStore(root);
  await snapshots.save(state);

  const restored = stateWithUserBudget("month");
  const loaded = await snapshots.load();
  Object.assign(restored, loaded);
  assert.equal(checkBudgets(restored, client, new Date("2026-06-20T00:00:00.000Z")).ok, false);
  assert.deepEqual(checkBudgets(restored, client, new Date("2026-07-01T00:00:00.000Z")), { ok: true, warnings: [] });
  await snapshots.close();
});

function stateWithUserBudget(period: BudgetPeriod): RuntimeState {
  return {
    usageByKey: {}, usageByUser: {}, usageByTeam: {}, usageByAgent: {}, usageByProvider: {},
    identity: {
      data: { keys: { key_1: {} } },
      getUser: () => ({ budget: { tokenLimit: 5, period, onExceed: "block" } }),
      getTeam: () => undefined
    }
  } as unknown as RuntimeState;
}

function manifest(timestamp: string, tokens: number) {
  return {
    requestId: timestamp, timestamp, method: "POST", path: "/v1", targetHost: "local",
    providerId: "default", client, compressedItems: 0, estimatedOriginalTokens: 0,
    estimatedCompressedTokens: 0, estimatedSavedTokens: 0, redactedSecrets: 0,
    retrievalIds: [], compressorsUsed: [], warnings: [], upstreamInputTokens: tokens, upstreamOutputTokens: 0
  };
}
