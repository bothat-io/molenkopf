import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

async function post(base: string, path: string, body: unknown, cookie = "", headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

const cookieOf = (res: Response): string => (res.headers.get("set-cookie") ?? "").split(";")[0];

test("session cookies and secret-bearing JSON responses use hardened headers", async () => {
  const oldScheme = process.env.MOLENKOPF_EXTERNAL_SCHEME;
  delete process.env.MOLENKOPF_EXTERNAL_SCHEME;
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-session-headers-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1`, dataDir: dir });
    const base = `http://127.0.0.1:${proxy.port}`;
    const setup = await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }, "", { "x-forwarded-proto": "https" });
    assertCookie(setup, { secure: false });
    assertNoCache(setup);
    const admin = cookieOf(setup);

    process.env.MOLENKOPF_EXTERNAL_SCHEME = "https";
    const login = await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" });
    assertCookie(login, { secure: true });
    assertNoCache(login);
    const logout = await post(base, "/__molenkopf/logout", {}, cookieOf(login));
    assertCookie(logout, { secure: true, expired: true });
    assertNoCache(logout);

    const user = await post(base, "/__molenkopf/identity/users", { id: "bob", password: "bob-secret", role: "member", teamIds: ["everyone"] }, admin);
    assert.equal(user.status, 200);
    const key = await post(base, "/__molenkopf/keys", { owner: "bob", project: "project-alpha" }, admin);
    assert.equal(key.status, 200);
    assertNoCache(key);
    assert.ok((await key.json()).secret.startsWith("mk_"));
  } finally {
    if (oldScheme === undefined) delete process.env.MOLENKOPF_EXTERNAL_SCHEME; else process.env.MOLENKOPF_EXTERNAL_SCHEME = oldScheme;
    if (proxy) await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

function assertCookie(response: Response, options: { secure: boolean; expired?: boolean }) {
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /molenkopf_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(/;\s*Secure\b/.test(cookie), options.secure);
  if (options.expired) assert.match(cookie, /Max-Age=0/);
}

function assertNoCache(response: Response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), "0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
