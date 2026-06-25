import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import type { RuntimeState } from "../src/http/runtime-state.ts";
import { consumeRuntimeAuthProof, issueRuntimeAuthProof } from "../src/http/runtime-auth-proof.ts";
import { installFakeCodex, postJson, runtimeProof, setupAdmin, withPath } from "./runtime-auth-test-utils.ts";

test("runtime auth proofs are single-use payload-bound and expiring", () => {
  const state = { runtimeAuthProofs: {} } as RuntimeState;
  const body = { runtime: "codex", authJson: "{\"account\":\"work\"}", activate: true };
  const first = issueRuntimeAuthProof(state, body, 1000);
  assert.equal(consumeRuntimeAuthProof(state, { ...body, authJson: "{\"account\":\"other\"}", importProof: first }, 1001), false);
  assert.equal(consumeRuntimeAuthProof(state, { ...body, importProof: first }, 1002), false, "changed payload consumes the proof");

  const second = issueRuntimeAuthProof(state, body, 2000);
  assert.equal(consumeRuntimeAuthProof(state, { ...body, importProof: second }, 2000 + 5 * 60 * 1000 + 1), false);

  const third = issueRuntimeAuthProof(state, body, 3000);
  assert.equal(consumeRuntimeAuthProof(state, { ...body, importProof: third }, 3001), true);
  assert.equal(consumeRuntimeAuthProof(state, { ...body, importProof: third }, 3002), false);
});

test("runtime auth import rejects untested changed and replayed payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-runtime-auth-proof-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  let restorePath = () => {};
  try {
    await installFakeCodex(dir);
    restorePath = withPath(dir);
    proxy = await startProxy({ port: 0, target: "http://127.0.0.1:1/v1", dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    const body = { id: "codex-proof", runtime: "codex", authJson: "{\"account\":\"proof\"}", activate: true };

    assert.equal((await postJson(`${base}/__molenkopf/providers/import-auth`, body, admin)).status, 409);
    assert.equal(existsSync(join(dir, "runtime-auth", "codex-proof")), false);

    const changedProof = await runtimeProof(base, body, admin);
    const changed = await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, authJson: "{\"account\":\"changed\"}", importProof: changedProof }, admin);
    assert.equal(changed.status, 409);
    assert.equal((await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, importProof: changedProof }, admin)).status, 409);

    const importProof = await runtimeProof(base, body, admin);
    assert.equal((await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, importProof }, admin)).status, 200);
    assert.equal((await postJson(`${base}/__molenkopf/providers/import-auth`, { ...body, importProof }, admin)).status, 409);
  } finally {
    if (proxy) await proxy.close().catch(() => {});
    restorePath();
    await rm(dir, { recursive: true, force: true });
  }
});
