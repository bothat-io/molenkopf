import { randomBytes } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { viewRuntimeProfile, type ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { defaultDataDir } from "../../../core/src/storage/local-paths.ts";
import { ensurePrivateDir } from "../../../core/src/storage/private-state.ts";
import type { RuntimeState } from "./runtime-state.ts";
import { buildProviderStatus } from "./local-api-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeAuthProvider, runtimeAuthProvider, writeRuntimeAuthFiles } from "./runtime-auth-registry.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import { runtimeProfileFromImport, writeRuntimeProfileFiles } from "../runtime/runtime-profile.ts";
import { consumeRuntimeAuthProof } from "./runtime-auth-proof.ts";

const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
const AUTH_IMPORT_BYTES = 256 * 1024;

export async function importProviderAuth(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req, AUTH_IMPORT_BYTES);
  const runtime = runtimeValue(body.runtime);
  if (!runtime) return writeJson(res, 400, { error: "invalid_runtime" });
  const authJson = authJsonText(body);
  if (!authJson) return writeJson(res, 400, { error: "missing_auth_json" });
  const parsedAuth = parseJsonObject(authJson);
  if (!parsedAuth) return writeJson(res, 400, { error: "invalid_auth_json" });
  const explicitId = typeof body.id === "string" ? body.id.trim() : "";
  const id = explicitId || uniqueGeneratedId(state, `${runtime}-import-${randomSuffix()}`);
  if (!ID_RE.test(id)) return writeJson(res, 400, { error: "invalid_provider_id" });
  if (id.toLowerCase() === "default") return writeJson(res, 400, { error: "reserved_provider_id" });
  if (state.providers.some((item) => item.id === id)) return writeJson(res, 409, { error: "provider_exists" });
  let runtimeProfile;
  try {
    runtimeProfile = runtimeProfileFromImport(body, runtime);
  } catch (error) {
    return writeJson(res, 400, { error: error instanceof Error ? error.message : "invalid_runtime_profile" });
  }
  if (!consumeRuntimeAuthProof(state, body)) return writeJson(res, 409, { error: "invalid_runtime_auth_proof" });

  const root = state.dataDir ?? defaultDataDir();
  const authRoot = join(root, "runtime-auth");
  const authDir = join(authRoot, id);
  const stagingDir = join(authRoot, `.staging-${id}-${randomSuffix()}`);
  const ref = `runtime-auth:${id}`;
  const name = importedName(body, runtime, id);
  const provider = runtimeAuthProvider(id, name, runtime, authDir, ref, runtimeProfile.profile);
  const snapshot = {
    providers: [...state.providers],
    providerWeights: { ...state.providerWeights },
    activeProviderId: state.activeProviderId,
    routingMode: state.routingMode,
    providerSelectedAt: state.providerSelectedAt
  };
  try {
    await ensurePrivateDir(authRoot);
    await writeRuntimeAuthFiles(stagingDir, runtime, authJson.endsWith("\n") ? authJson : `${authJson}\n`);
    await writeRuntimeProfileFiles(stagingDir, runtimeProfile);
    await rename(stagingDir, authDir);
    state.providers.push(provider);
    state.providerWeights[id] = 1;
    if (body.activate !== false) {
      state.activeProviderId = id;
      state.routingMode = "manual";
      state.providerSelectedAt = new Date().toISOString();
    }
    await persistRuntimeAuthProvider(root, provider, body.activate !== false, state.routingMode);
    await persistRuntimeSettings(state);
  } catch (error) {
    state.providers = snapshot.providers;
    state.providerWeights = snapshot.providerWeights;
    state.activeProviderId = snapshot.activeProviderId;
    state.routingMode = snapshot.routingMode;
    state.providerSelectedAt = snapshot.providerSelectedAt;
    await rm(authDir, { recursive: true, force: true });
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
  writeJson(res, 200, { imported: { id, name, runtime, runtimeAuthConfigured: true, profile: viewRuntimeProfile(runtimeProfile.profile), active: state.activeProviderId === id }, providers: buildProviderStatus(state) });
}

function runtimeValue(value: unknown): ProviderConfig["runtime"] | undefined {
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

function randomSuffix(): string {
  return randomBytes(3).toString("hex");
}

function uniqueGeneratedId(state: RuntimeState, base: string): string {
  if (!state.providers.some((item) => item.id === base)) return base;
  for (let index = 2; index < 100; index++) {
    const id = `${base}-${index}`;
    if (!state.providers.some((item) => item.id === id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function importedName(body: Record<string, unknown>, runtime: "claude" | "codex", id: string): string {
  if (typeof body.name === "string" && body.name.trim()) return body.name.trim().slice(0, 80);
  return `${label(runtime)} imported account ${id.slice(-6)}`;
}

function label(runtime: "claude" | "codex"): string {
  return runtime === "codex" ? "Codex" : "Claude";
}
