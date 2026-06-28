import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";
import { auth, issueKey } from "./proxy-auth-utils.ts";

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  return typeof addr === "object" && addr ? addr.port : 0;
}

async function pollJson(url: string, predicate: (value: any) => boolean, attempts = 50, cookie = ""): Promise<any> {
  const init = cookie ? { headers: { cookie } } : undefined;
  for (let i = 0; i < attempts; i++) {
    const value = await fetch(url, init).then((r) => r.json());
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return fetch(url, init).then((r) => r.json());
}

test("records real upstream token usage from the provider response", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-usage-"));
  const upstream = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_1", usage: { input_tokens: 1234, output_tokens: 567 } }));
  });
  const upstreamPort = await listenOn(upstream);
  const proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${upstreamPort}/v1`, dataDir: dir });
  const base = `http://127.0.0.1:${proxy.port}`;
  try {
    const admin = await setupAdmin(base);
    const key = await issueKey(base, admin, "usage");
    const res = await fetch(`${base}/v1/messages`, { method: "POST", headers: auth(key, { "content-type": "application/json" }), body: JSON.stringify({ model: "gpt-live-test", reasoning: { effort: "xhigh" } }) });
    await res.text();
    const latest = await pollJson(`${base}/__molenkopf/requests/latest`, (m) => m.upstreamInputTokens === 1234, 50, admin);
    assert.equal(latest.upstreamInputTokens, 1234);
    assert.equal(latest.upstreamOutputTokens, 567);
    assert.equal(latest.requestedModel, "gpt-live-test");
    assert.equal(latest.requestedReasoning, "xhigh");
    const usage = await fetch(`${base}/__molenkopf/usage`, { headers: { cookie: admin } }).then((r) => r.json());
    const user = usage.users.find((item: any) => item.id === "admin");
    assert.equal(user.usage.models["gpt-live-test"].inputTokens, 1234);
    assert.equal(user.usage.models["gpt-live-test"].outputTokens, 567);
    assert.equal(user.usage.models["gpt-live-test"].reasoning.xhigh.requests, 1);
  } finally {
    await proxy.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function setupAdmin(base: string): Promise<string> {
  const response = await fetch(`${base}/__molenkopf/setup-admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin-secret" }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
