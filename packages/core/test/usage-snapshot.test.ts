import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/identity/db.ts";
import { UsageSnapshotError, UsageSnapshotStore, type UsageMaps } from "../src/identity/usage-snapshot.ts";

test("scheduled snapshots are latest-wins while a flush is in progress", async () => {
  const store = new UsageSnapshotStore();
  const saved: UsageMaps[] = [];
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  store.save = async (maps: UsageMaps) => {
    saved.push(clone(maps));
    if (saved.length === 1) await firstBlocked;
  };

  store.schedule(maps("first"));
  await Promise.resolve();
  store.schedule(maps("second"));
  releaseFirst();
  await store.flush();

  assert.deepEqual(saved.map((item) => Object.keys(item.usageByUser)[0]), ["first", "second"]);
});

test("close flushes the final pending snapshot before closing storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-usage-snapshot-"));
  try {
    const store = new UsageSnapshotStore(root);
    store.schedule(maps("final"));
    await store.close();
    const reopened = new UsageSnapshotStore(root);
    const loaded = await reopened.load();
    assert.deepEqual(loaded?.usageByUser, { final: { inputTokens: 1 } });
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed scheduled snapshot writes are retained and surfaced", async () => {
  const store = new UsageSnapshotStore();
  let fail = true;
  const saved: string[] = [];
  store.save = async (value: UsageMaps) => {
    const id = Object.keys(value.usageByUser)[0];
    if (fail) throw new Error("disk full");
    saved.push(id);
  };
  store.schedule(maps("pending"));
  await Promise.resolve();
  await assert.rejects(store.flush(), /disk full/);
  fail = false;
  await store.flush();
  assert.deepEqual(saved, ["pending"]);
});

test("closed usage snapshot stores reject direct writes", async () => {
  const store = new UsageSnapshotStore();
  await store.close();
  await assert.rejects(store.save(maps("late")), UsageSnapshotError);
});

test("corrupt snapshot rows fail closed instead of looking absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-usage-corrupt-"));
  try {
    const db = openDb(root);
    db.prepare("INSERT INTO usage(scope, id, json) VALUES('live', 'usageByUser', ?)").run("{");
    db.close();
    const store = new UsageSnapshotStore(root);
    await assert.rejects(store.load(), UsageSnapshotError);
    await store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function maps(id: string): UsageMaps {
  return { usageByAgent: {}, usageByUser: { [id]: { inputTokens: 1 } }, usageByProvider: {}, usageByKey: {}, usageByTeam: {} };
}

function clone(maps: UsageMaps): UsageMaps {
  return JSON.parse(JSON.stringify(maps)) as UsageMaps;
}
