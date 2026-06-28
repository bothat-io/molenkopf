import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

export async function startPolicyProxy(prefix: string) {
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamPort = await listenOn(upstream);
  const dataDir = await mkdtemp(join(tmpdir(), prefix));
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir });
  return {
    base: `http://127.0.0.1:${proxy.port}`,
    proxy,
    upstream,
    dataDir,
    async close() {
      await proxy.close();
      await closeServer(upstream);
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}

export async function setupAdmin(base: string): Promise<string> {
  return cookieFrom(await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" }));
}

export const getAuth = (base: string, path: string, cookie: string) => fetch(`${base}${path}`, { headers: { cookie } });
export const putAuth = (base: string, path: string, body: unknown, cookie: string) =>
  fetch(`${base}${path}`, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
export const post = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const postAuth = (base: string, path: string, body: unknown, cookie: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });

export function cookieFrom(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return typeof address === "object" && address ? address.port : 0;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
