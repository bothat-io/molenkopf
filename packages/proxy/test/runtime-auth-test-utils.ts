import assert from "node:assert/strict";
import { chmod, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

export async function setupAdmin(base: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/setup-admin`, { username: "admin", password: "admin-secret" });
  assert.equal(response.status, 200);
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

export function postJson(url: string, body: unknown, cookie = ""): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

export async function runtimeProof(base: string, body: Record<string, unknown>, cookie: string): Promise<string> {
  const response = await postJson(`${base}/__molenkopf/providers/test-runtime`, body, cookie);
  assert.equal(response.status, 200);
  const json = await response.json() as { importProof?: string };
  assert.equal(typeof json.importProof, "string");
  return json.importProof;
}

export function withPath(dir: string): () => void {
  const original = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${original ?? ""}`;
  return () => {
    if (original === undefined) delete process.env.PATH;
    else process.env.PATH = original;
  };
}

export async function installFakeCodex(dir: string): Promise<void> {
  await installFakeRuntime(dir, "codex", "CODEX_HOME", "auth.json");
}

export async function installFakeClaude(dir: string): Promise<void> {
  await installFakeRuntime(dir, "claude", "CLAUDE_CONFIG_DIR", ".credentials.json");
}

async function installFakeRuntime(dir: string, command: string, envName: string, fileName: string): Promise<void> {
  const script = join(dir, `fake-${command}.cjs`);
  await writeFile(script, [
    "const fs = require('fs');",
    "const path = require('path');",
    "process.stdin.setEncoding('utf8');",
    "let input = '';",
    "process.stdin.on('data', (chunk) => input += chunk);",
    "process.stdin.on('end', () => {",
    `  const auth = JSON.parse(fs.readFileSync(path.join(process.env.${envName}, '${fileName}'), 'utf8'));`,
    "  process.stdout.write('imported ' + (auth.account || 'account') + ': ' + input.trim());",
    "});"
  ].join("\n"));
  if (process.platform === "win32") return writeFile(join(dir, `${command}.cmd`), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  const shim = join(dir, command);
  await writeFile(shim, `#!/bin/sh\n"${process.execPath}" "${script}" "$@"\n`);
  await chmod(shim, 0o755);
}
