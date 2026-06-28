import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("provider weight batches ignore providers excluded from distribution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-provider-weights-"));
  const proxy = await startProxy({
    port: 0,
    target: "http://127.0.0.1:1/v1",
    providers: [
      { id: "manual-only", name: "Manual Only", kind: "api", target: "http://127.0.0.1:2/v1", allowDistribution: false },
      { id: "weighted", name: "Weighted", kind: "api", target: "http://127.0.0.1:3/v1" }
    ],
    providerCatalogMode: "explicit",
    dataDir: dir
  });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const rejected = await post(base, { weights: { "manual-only": 100, weighted: 0 }, mode: "distribute" }, admin);
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).error, "no_weighted_provider");

    const accepted = await post(base, { weights: { "manual-only": 0, weighted: 100 }, mode: "distribute" }, admin);
    assert.equal(accepted.status, 200);
    const body = await accepted.json();
    const manual = body.providers.configuredItems.find((item: { id: string }) => item.id === "manual-only");
    const weighted = body.providers.configuredItems.find((item: { id: string }) => item.id === "weighted");
    assert.equal(manual.sharePercent, 0);
    assert.equal(weighted.sharePercent, 100);
  } finally {
    await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function setupAdmin(base: string): Promise<string> {
  const res = await post(base, { username: "admin", password: "admin-secret" }, "", "/__molenkopf/setup-admin");
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function post(base: string, body: unknown, cookie = "", path = "/__molenkopf/providers/weights") {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}
