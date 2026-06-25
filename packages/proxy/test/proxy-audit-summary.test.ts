import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("audit summary reports token savings by user bucket without leaking credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-summary-"));
  const previousRequireKey = process.env.MOLENKOPF_REQUIRE_KEY;
  delete process.env.MOLENKOPF_REQUIRE_KEY;
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); });
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const target = `http://127.0.0.1:${(upstream.address() as { port: number }).port}/v1`;
    proxy = await startProxy({
      port: 0, target, dataDir: dir, providerCatalogMode: "explicit", activeProviderId: "summary-upstream",
      providers: [{ id: "summary-upstream", name: "Summary upstream", kind: "local", target, authScheme: "none" }]
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);
    // Compression is opt-in (transparent by default); enable it to assert savings.
    const toggle = await fetch(`${base}/__molenkopf/plugins/toggle`, { method: "POST", headers: { "content-type": "application/json", cookie: admin }, body: JSON.stringify({ id: "context-compressor-plugin", enabled: true }) });
    assert.equal(toggle.status, 200);
    const longLog = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR done";
    const sent = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-molenkopf-user": "Operator", authorization: "Bearer sk-secret" },
      body: JSON.stringify({ input: longLog })
    });
    assert.equal(sent.status, 200);
    const summary = await waitForSummary(proxy.port, admin);
    assert.equal(summary.requests, 1);
    assert.equal(summary.buckets[0].id, "user:operator");
    assert.ok(summary.savedTokens > 0);
    assert.doesNotMatch(JSON.stringify(summary), /sk-secret|Bearer/);
  } finally {
    if (previousRequireKey === undefined) delete process.env.MOLENKOPF_REQUIRE_KEY; else process.env.MOLENKOPF_REQUIRE_KEY = previousRequireKey;
    if (proxy) await proxy.close();
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

async function setupAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function waitForSummary(port: number, cookie: string): Promise<any> {
  let summary: any = {};
  for (let attempt = 0; attempt < 30; attempt++) {
    summary = await fetch(`http://127.0.0.1:${port}/__molenkopf/audit/summary`, { headers: { cookie } }).then((r) => r.json());
    if (summary.requests === 1) return summary;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return fetch(`http://127.0.0.1:${port}/__molenkopf/audit/summary`, { headers: { cookie } }).then((r) => r.json());
}
