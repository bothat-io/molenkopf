import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { isCliProvider, runCliProvider } from "../runtime/cli-provider.ts";
import { cliErrorDiagnostics, safeCliMessage, successfulCliLifecycle } from "../runtime/cli-diagnostics.ts";
import { runtimeProfileFromImport, writeRuntimeProfileFiles } from "../runtime/runtime-profile.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { missingProviderCredential } from "./header-utils.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { providerHttpTest } from "./provider-http-test.ts";
import { runtimeAuthProvider, writeRuntimeAuthFiles } from "./runtime-auth-registry.ts";
import { issueRuntimeAuthProof } from "./runtime-auth-proof.ts";

type Check = { status: "ok" | "failed" | "missing" | "unknown" | "blocked"; message: string };
const RUNTIME_TEST_BYTES = 256 * 1024;

export async function testRuntimeProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const result = await selectedProviderTest(req, state, "runtime");
  writeJson(res, statusOfTestResult(result), result);
}

export async function testProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const result = await selectedProviderTest(req, state, "auto");
  writeJson(res, statusOfTestResult(result), result);
}

async function selectedProviderTest(req: IncomingMessage, state: RuntimeState, mode: "auto" | "runtime") {
  const body = await readJson(req, mode === "runtime" ? RUNTIME_TEST_BYTES : undefined);
  if (mode === "runtime" && hasDraftRuntimeAuth(body)) {
    const result = await draftRuntimeProviderTest(body);
    return statusOfTestResult(result) === 200 ? { ...result, importProof: issueRuntimeAuthProof(state, body) } : result;
  }
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : state.activeProviderId;
  const provider = state.providers.find((item) => item.id === id);
  if (!provider) return { error: "unknown_provider" };
  if (provider.enabled === false) return { error: "provider_disabled" };
  if (mode === "auto" && !isCliProvider(provider)) return providerHttpTest(provider);
  return providerRuntimeTest(provider);
}

function statusOfTestResult(result: any): number {
  if (result.error === "invalid_runtime" || result.error === "missing_auth_json" || result.error === "invalid_auth_json" || result.error === "invalid_runtime_profile") return 400;
  if (result.error === "unknown_provider") return 404;
  if (result.error === "provider_disabled") return 409;
  if (result.permission?.status === "blocked" || result.model?.status === "failed" || result.auth?.status === "failed") return 502;
  return 200;
}

async function draftRuntimeProviderTest(body: Record<string, unknown>) {
  const runtime = runtimeValue(body.runtime);
  if (!runtime) return { error: "invalid_runtime" };
  const authJson = authJsonText(body);
  if (!authJson) return { error: "missing_auth_json" };
  if (!parseJsonObject(authJson)) return { error: "invalid_auth_json" };
  let runtimeProfile;
  try {
    runtimeProfile = runtimeProfileFromImport(body, runtime);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "invalid_runtime_profile" };
  }
  const root = await mkdtemp(join(tmpdir(), "molenkopf-runtime-test-"));
  try {
    const authDir = join(root, "runtime-auth", "draft");
    await writeRuntimeAuthFiles(authDir, runtime, authJson.endsWith("\n") ? authJson : `${authJson}\n`);
    await writeRuntimeProfileFiles(authDir, runtimeProfile);
    const provider = runtimeAuthProvider("draft", "Draft runtime provider", runtime, authDir, "runtime-auth:draft", runtimeProfile.profile);
    return { ...(await providerRuntimeTest(provider)), draft: true };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function hasDraftRuntimeAuth(body: Record<string, unknown>): boolean {
  return typeof body.runtime === "string" && "authJson" in body;
}

function runtimeValue(value: unknown): "claude" | "codex" | undefined {
  return value === "claude" || value === "codex" ? value : undefined;
}

function authJsonText(body: Record<string, unknown>): string {
  if (typeof body.authJson === "string" && body.authJson.trim()) return body.authJson.trim();
  return "";
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export async function providerRuntimeTest(provider: ProviderConfig) {
  const base = {
    providerId: provider.id,
    runtime: provider.runtime ?? provider.kind,
    auth: authCheck(provider),
    model: { status: "unknown", message: "Not tested yet" } as Check,
    permission: permissionCheck(provider),
    lifecycle: { state: "unknown", events: [] as string[] }
  };
  if (base.auth.status === "missing") return base;
  if (!isCliProvider(provider)) return { ...base, model: { status: "unknown", message: "Only local CLI providers are tested here" } as Check };
  try {
    const checkedProvider = { ...provider, cliTimeoutMs: Math.min(provider.cliTimeoutMs ?? 30000, 30000) };
    const result = await runCliProvider(checkedProvider, JSON.stringify({ input: "Reply with OK only. Molenkopf provider test." }), `test-${Date.now()}`);
    return { ...base, model: modelCheck(result.body), permission: { ...base.permission, message: "No host permission block was observed during this read-only test" }, lifecycle: successfulCliLifecycle() };
  } catch (error) {
    const message = safeCliMessage(error);
    const cli = cliErrorDiagnostics(error);
    if (cli.permissionBlocked) return { ...base, model: { status: "failed", message: "CLI did not complete" } as Check, permission: { status: "blocked", message: "Local CLI reported a permission prompt" } as Check, lifecycle: cli.lifecycle };
    if (cli.class === "auth_failure") return { ...base, auth: { status: "failed", message } as Check, model: { status: "failed", message: "CLI did not complete" } as Check, lifecycle: cli.lifecycle };
    return { ...base, auth: authFromError(message, base.auth), model: { status: "failed", message } as Check, lifecycle: cli.lifecycle };
  }
}

function authCheck(provider: ProviderConfig): Check {
  if (missingProviderCredential(provider)) return { status: "missing", message: "Provider credential is missing" };
  if (provider.runtimeAuthDir) return { status: "ok", message: "Imported auth directory is configured" };
  if (provider.kind === "cli") return { status: "unknown", message: "Local CLI auth is managed by the installed client" };
  return { status: "ok", message: "Provider credential policy is configured" };
}

function permissionCheck(provider: ProviderConfig): Check {
  if (provider.runtime === "claude") return { status: "unknown", message: "Outer Claude harness permissions are separate from imported auth" };
  if (provider.runtime === "codex") return { status: "unknown", message: "Outer Codex harness permissions are separate from imported auth" };
  return { status: "unknown", message: "No imported runtime permission profile" };
}

function modelCheck(body: Buffer): Check {
  const text = body.toString("utf8");
  try {
    const json = JSON.parse(text) as { output_text?: string; content?: { text?: string }[] };
    const output = json.output_text ?? json.content?.map((item) => item.text).filter(Boolean).join(" ");
    return output ? { status: "ok", message: "Model produced a non-empty response" } : { status: "failed", message: "Model response had no text" };
  } catch {
    return text.trim() ? { status: "ok", message: "Model produced a non-empty response" } : { status: "failed", message: "Model response was empty" };
  }
}

function authFromError(message: string, current: Check): Check {
  return /output_class:auth_failure|not logged in|please run \/login|auth|authentication|credentials/i.test(message)
    ? { status: "failed", message }
    : current;
}
