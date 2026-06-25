import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProxy } from "../src/http/server.ts";

test("CLI provider timeout returns a stable client error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-timeout-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "hang.cjs");
    await writeFile(script, [
      "process.stderr.write('token=' + 'sk-ant-' + 'abcdefghijklmnopqrstuvwxyz1234567890');",
      "process.stdin.resume();",
      "setInterval(() => {}, 1000);"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-hang",
      providers: [{ id: "claude-hang", name: "Claude Hang", kind: "cli", target: "cli://claude-hang", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin", cliTimeoutMs: 1000 }],
      activeProviderId: "claude-hang",
      providerCatalogMode: "explicit",
      dataDir: dir
    });

    const started = Date.now();
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "will hang" })
    });
    const elapsed = Date.now() - started;
    const responseJson = await response.json() as { error: string; requestId: string };

    assert.equal(response.status, 502);
    assert.ok(elapsed < 3000, `timeout should return quickly, got ${elapsed}ms`);
    assert.equal(responseJson.error, "proxy_error");
    assert.match(responseJson.requestId, /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(responseJson), /timed out|lifecycle|sk-ant-/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("imported CLI provider env strips ambient provider credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-env-"));
  const original = snapshotEnv(["OPENAI_API_KEY", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]);
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    process.env.OPENAI_API_KEY = "ambient-openai";
    process.env.OPENAI_BASE_URL = "http://wrong-openai";
    process.env.ANTHROPIC_API_KEY = "ambient-anthropic";
    process.env.ANTHROPIC_BASE_URL = "http://wrong-anthropic";
    const authDir = join(dir, "runtime-auth", "codex-import");
    await mkdir(authDir, { recursive: true });
    const script = join(dir, "env-check.cjs");
    await writeFile(script, [
      "const blocked = ['OPENAI_API_KEY','OPENAI_BASE_URL','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL'].filter((key) => process.env[key]);",
      "process.stdin.resume();",
      "process.stdin.on('end', () => process.stdout.write(JSON.stringify({ codexHome: process.env.CODEX_HOME === process.argv[2], blocked })));"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-import",
      providers: [{ id: "codex-import", name: "Codex Import", kind: "cli", target: "cli://codex-import", runtime: "codex", cliCommand: process.execPath, cliArgs: [script, authDir], cliInputMode: "stdin", runtimeAuthDir: authDir }],
      activeProviderId: "codex-import",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "env check" }) });
    const responseJson = await response.json() as { output_text: string };
    const output = JSON.parse(responseJson.output_text);
    assert.equal(response.status, 200);
    assert.equal(output.codexHome, true);
    assert.deepEqual(output.blocked, []);
  } finally {
    restoreEnv(original);
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("plain CLI provider env strips ambient provider credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-env-plain-"));
  const original = snapshotEnv(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]);
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    process.env.OPENAI_API_KEY = "ambient-openai";
    process.env.ANTHROPIC_API_KEY = "ambient-anthropic";
    const script = join(dir, "env-check.cjs");
    await writeFile(script, [
      "const blocked = ['OPENAI_API_KEY','ANTHROPIC_API_KEY'].filter((key) => process.env[key]);",
      "process.stdin.resume();",
      "process.stdin.on('end', () => process.stdout.write(JSON.stringify({ blocked })));"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://codex-plain",
      providers: [{ id: "codex-plain", name: "Codex Plain", kind: "cli", target: "cli://codex-plain", runtime: "codex", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin" }],
      activeProviderId: "codex-plain",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "env check" }) });
    const responseJson = await response.json() as { output_text: string };
    assert.deepEqual(JSON.parse(responseJson.output_text).blocked, []);
  } finally {
    restoreEnv(original);
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("blank successful CLI output becomes a provider error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-blank-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "blank.cjs");
    await writeFile(script, "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));\n");
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-blank",
      providers: [{ id: "claude-blank", name: "Claude Blank", kind: "cli", target: "cli://claude-blank", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin" }],
      activeProviderId: "claude-blank",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "blank" }) });
    const responseJson = await response.json() as { error: string; requestId: string };
    assert.equal(response.status, 502);
    assert.equal(responseJson.error, "proxy_error");
    assert.match(responseJson.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("interactive Claude permission prompts return stable client errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molenkopf-cli-permission-"));
  let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
  try {
    const script = join(dir, "permission.cjs");
    await writeFile(script, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => {",
      "  process.stderr.write(\"Claude requested permissions to write to .project-alpha-write-test.txt, but you haven't granted it yet.\");",
      "  process.exit(1);",
      "});"
    ].join("\n"));
    proxy = await startProxy({
      port: 0,
      target: "cli://claude-permission",
      providers: [{ id: "claude-permission", name: "Claude Permission", kind: "cli", target: "cli://claude-permission", runtime: "claude", cliCommand: process.execPath, cliArgs: [script], cliInputMode: "stdin" }],
      activeProviderId: "claude-permission",
      providerCatalogMode: "explicit",
      dataDir: dir
    });
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "write test" }) });
    const responseJson = await response.json() as { error: string; requestId: string };
    assert.equal(response.status, 502);
    assert.equal(responseJson.error, "proxy_error");
    assert.match(responseJson.requestId, /^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(responseJson), /permissions|project-alpha/);
  } finally {
    if (proxy) await proxy.close();
    await rm(dir, { recursive: true, force: true });
  }
});

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
