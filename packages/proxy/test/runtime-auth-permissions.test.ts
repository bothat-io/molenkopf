import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistRuntimeAuthProvider, persistRuntimeAuthSelection, runtimeAuthProvider, writeRuntimeAuthFiles } from "../src/http/runtime-auth-registry.ts";
import { writeRuntimeProfileFiles } from "../src/runtime/runtime-profile.ts";

test("runtime auth state is private under permissive umask", async () => withPermissiveUmask(async () => {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-private-runtime-auth-"));
  const authDir = join(root, "runtime-auth", "claude-a");
  await writeRuntimeAuthFiles(authDir, "claude", "{}\n");
  await writeRuntimeProfileFiles(authDir, { settingsJson: "{}\n" });
  const provider = runtimeAuthProvider("claude-a", "Claude A", "claude", authDir, "runtime-auth:claude-a");
  await persistRuntimeAuthProvider(root, provider, true, "manual");
  await persistRuntimeAuthSelection(root, "claude-a", "manual");

  await assertMode(join(root, "runtime-auth"), 0o700);
  await assertMode(authDir, 0o700);
  for (const file of ["auth.json", ".credentials.json", "settings.json", "provider.json"]) await assertMode(join(authDir, file), 0o600);
  await assertMode(join(root, "runtime-auth", "state.json"), 0o600);
  await rm(root, { recursive: true, force: true });
}));

async function withPermissiveUmask(run: () => Promise<void>): Promise<void> {
  if (process.platform === "win32") return run();
  const previous = process.umask(0);
  try { await run(); } finally { process.umask(previous); }
}

async function assertMode(path: string, expected: number): Promise<void> {
  if (process.platform === "win32") return;
  assert.equal((await stat(path)).mode & 0o777, expected, path);
}
