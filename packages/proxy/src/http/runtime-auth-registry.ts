import { existsSync, readdirSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CLI_PROVIDER_TIMEOUT_MS } from "../../../core/src/providers/provider-catalog.ts";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { defaultDataDir } from "../../../core/src/storage/local-paths.ts";
import { ensurePrivateDir, writePrivateFile } from "../../../core/src/storage/private-state.ts";
import type { RoutingMode } from "./runtime-state.ts";
import { runtimeCliArgs } from "../runtime/runtime-profile.ts";

type RuntimeAuthMeta = Pick<ProviderConfig, "id" | "name" | "runtime" | "runtimeProfile" | "allowDistribution"> & { authRef: string };
type RuntimeAuthState = { activeProviderId?: string; routingMode?: RoutingMode };

const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
const META_FILE = "provider.json";
const STATE_FILE = "state.json";
export const DEFAULT_RUNTIME_AUTH_CLI_TIMEOUT_MS = DEFAULT_CLI_PROVIDER_TIMEOUT_MS;

export function restoreRuntimeAuthProviders(dataDir: string | undefined): { providers: ProviderConfig[]; activeProviderId?: string; routingMode?: RoutingMode } {
  const root = runtimeAuthRoot(dataDir);
  if (!root || !existsSync(root)) return { providers: [] };
  const providers = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => providerFromDir(root, entry.name))
    .filter((provider): provider is ProviderConfig => Boolean(provider));
  const persisted = readJson<RuntimeAuthState>(join(root, STATE_FILE));
  const activeProviderId = providers.some((item) => item.id === persisted?.activeProviderId) ? persisted?.activeProviderId : undefined;
  return { providers, activeProviderId, routingMode: persisted?.routingMode };
}

export async function writeRuntimeAuthFiles(authDir: string, runtime: "claude" | "codex", content: string): Promise<void> {
  await ensurePrivateDir(authDir);
  await writePrivateFile(join(authDir, "auth.json"), content);
  if (runtime === "claude") await writePrivateFile(join(authDir, ".credentials.json"), content);
}

export async function persistRuntimeAuthProvider(dataDir: string | undefined, provider: ProviderConfig, active: boolean, routingMode: RoutingMode): Promise<void> {
  if (!provider.runtimeAuthDir || !provider.runtime) return;
  await ensurePrivateDir(provider.runtimeAuthDir);
  const meta: RuntimeAuthMeta = {
    id: provider.id,
    name: provider.name,
    runtime: provider.runtime,
    authRef: provider.authRef ?? `runtime-auth:${provider.id}`,
    runtimeProfile: provider.runtimeProfile,
    allowDistribution: provider.allowDistribution
  };
  await writePrivateFile(join(provider.runtimeAuthDir, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
  if (active) await persistRuntimeAuthSelection(dataDir, provider.id, routingMode);
}

export async function persistRuntimeAuthSelection(dataDir: string | undefined, activeProviderId: string, routingMode: RoutingMode): Promise<void> {
  const root = runtimeAuthRoot(dataDir);
  if (!root) return;
  await ensurePrivateDir(root);
  await writePrivateFile(join(root, STATE_FILE), `${JSON.stringify({ activeProviderId, routingMode }, null, 2)}\n`);
}

export async function removeRuntimeAuthProvider(provider: ProviderConfig): Promise<void> {
  if (!provider.runtimeAuthDir) return;
  await rm(provider.runtimeAuthDir, { recursive: true, force: true });
}

export function runtimeAuthProvider(id: string, name: string, runtime: "claude" | "codex", authDir: string, authRef: string, profile?: ProviderConfig["runtimeProfile"]): ProviderConfig {
  return {
    id,
    name,
    kind: "cli",
    target: `cli://${id}`,
    runtime,
    cliCommand: runtime,
    cliArgs: runtimeCliArgs(runtime, authDir, profile),
    cliInputMode: "stdin",
    cliTimeoutMs: DEFAULT_RUNTIME_AUTH_CLI_TIMEOUT_MS,
    authScheme: "none",
    credentialRef: "none",
    runtimeAuthDir: authDir,
    authRef,
    runtimeProfile: profile,
    allowDistribution: true,
    enabled: true
  };
}

function providerFromDir(root: string, id: string): ProviderConfig | undefined {
  if (!ID_RE.test(id)) return undefined;
  const authDir = join(root, id);
  const meta = readJson<RuntimeAuthMeta>(join(authDir, META_FILE));
  if (meta && meta.id === id && (meta.runtime === "claude" || meta.runtime === "codex") && typeof meta.authRef === "string" && meta.authRef.trim()) {
    const provider = runtimeAuthProvider(id, meta.name || id, meta.runtime, authDir, meta.authRef.trim(), meta.runtimeProfile);
    if (typeof meta.allowDistribution === "boolean") provider.allowDistribution = meta.allowDistribution;
    return provider;
  }
  return undefined;
}

function runtimeAuthRoot(dataDir: string | undefined): string | undefined {
  return join(dataDir ?? defaultDataDir(), "runtime-auth");
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}
