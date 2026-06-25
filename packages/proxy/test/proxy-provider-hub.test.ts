import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("provider hub lists providers and switches the active upstream", async () => {
  let primaryHits = 0;
  let backupHits = 0;
  const primary = createServer((req, res) => respond(req, res, () => primaryHits++));
  const backup = createServer((req, res) => respond(req, res, () => backupHits++));
  const oldBackupKey = process.env.BACKUP_KEY;
  process.env.BACKUP_KEY = "backup-secret";
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  let dataDir = "";
  try {
    await listen(primary);
    await listen(backup);
    const primaryPort = (primary.address() as { port: number }).port;
    const backupPort = (backup.address() as { port: number }).port;
    dataDir = await mkdtemp(join(tmpdir(), "molenkopf-provider-hub-"));
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${primaryPort}/v1`,
      providers: [{ id: "backup", name: "Backup provider", kind: "local", target: `http://127.0.0.1:${backupPort}/v1`, credentialEnv: "BACKUP_KEY", authScheme: "bearer" }],
      dataDir
    });
    const base = `http://127.0.0.1:${proxy.port}`;
    const admin = await setupAdmin(base);

    const providers = await fetch(`${base}/__molenkopf/providers`, { headers: { cookie: admin } }).then((r) => r.json());
    assert.equal(providers.activeProviderId, "default");
    assert.equal(providers.items.some((item: { id: string }) => item.id === "backup"), true);
    assert.doesNotMatch(JSON.stringify(providers), /BACKUP_KEY=/);

    const selected = await postJson(`${base}/__molenkopf/providers/select`, { id: "backup" }, admin);
    assert.equal(selected.activeProviderId, "backup");
    await fetch(`${base}/v1/responses`, { method: "POST", body: "{}" });
    assert.equal(primaryHits, 0);
    assert.equal(backupHits, 1);

    await proxy.close();
    proxy = await startProxy({
      port: 0,
      target: `http://127.0.0.1:${primaryPort}/v1`,
      providers: [{ id: "backup", name: "Backup provider", kind: "local", target: `http://127.0.0.1:${backupPort}/v1`, credentialEnv: "BACKUP_KEY", authScheme: "bearer" }],
      dataDir
    });
    const restoredBase = `http://127.0.0.1:${proxy.port}`;
    const restoredAdmin = await loginAdmin(restoredBase);
    const restored = await fetch(`${restoredBase}/__molenkopf/providers`, { headers: { cookie: restoredAdmin } }).then((r) => r.json());
    assert.equal(restored.activeProviderId, "backup");

    const options = await postJson(`${restoredBase}/__molenkopf/providers/update`, { id: "backup", allowDistribution: true, allowedProjects: ["project-alpha/main"], blockedProjects: ["old-client"] }, restoredAdmin);
    const backupView = options.items.find((item: any) => item.id === "backup");
    assert.equal(backupView.allowDistribution, true);
    assert.equal(backupView.allowedProjects, undefined);
    assert.equal(backupView.blockedProjects, undefined);

    const preserved = await postJson(`${restoredBase}/__molenkopf/providers/update`, { id: "backup", name: "Backup renamed" }, restoredAdmin);
    const preservedView = preserved.items.find((item: any) => item.id === "backup");
    assert.equal(preservedView.allowDistribution, true);

    const disabled = await postJson(`${restoredBase}/__molenkopf/providers/update`, { id: "backup", enabled: false }, restoredAdmin);
    assert.equal(disabled.activeProviderId, "default");
    await fetch(`${restoredBase}/v1/responses`, { method: "POST", body: "{}" });
    assert.equal(primaryHits, 1);
    assert.equal(backupHits, 1);
  } finally {
    if (oldBackupKey === undefined) delete process.env.BACKUP_KEY;
    else process.env.BACKUP_KEY = oldBackupKey;
    if (proxy) await proxy.close().catch(() => {});
    await close(primary);
    await close(backup);
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  }
});

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}
function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
function respond(req: IncomingMessage, res: ServerResponse, hit: () => void) {
  hit();
  req.resume();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, path: req.url }));
}
async function setupAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/setup-admin`, { username: "admin", password: "admin-secret" });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
async function loginAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/login`, { username: "admin", password: "admin-secret" });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
async function postJson(url: string, body: unknown, cookie = "") {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  if (url.endsWith("/setup-admin") || url.endsWith("/login")) return response;
  return response.json();
}
