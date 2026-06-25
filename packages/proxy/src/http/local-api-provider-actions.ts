import type { IncomingMessage, ServerResponse } from "node:http";
import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { distributionEligible, providerWeight, repairActiveProvider, type RuntimeState } from "./runtime-state.ts";
import { buildProviderStatus } from "./local-api-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeAuthProvider, persistRuntimeAuthSelection, removeRuntimeAuthProvider } from "./runtime-auth-registry.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";

export async function selectProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const provider = state.providers.find((item) => item.id === id);
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  if (provider.enabled === false) return writeJson(res, 409, { error: "provider_disabled" });
  state.activeProviderId = provider.id;
  state.providerSelectedAt = new Date().toISOString();
  await persistProviderRouting(state);
  writeJson(res, 200, buildProviderStatus(state));
}

export async function setProviderWeight(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "", provider = state.providers.find((item) => item.id === id);
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  if (typeof body.weight !== "number" || !Number.isFinite(body.weight) || body.weight < 0 || body.weight > 1000) return writeJson(res, 400, { error: "invalid_weight" });
  const weights = { ...state.providerWeights, [id]: body.weight };
  if (distributionEligible(provider) && !hasPositiveDistributionWeight(state, weights)) return writeJson(res, 409, { error: "last_provider_weight" });
  state.providerWeights[id] = body.weight;
  await persistRuntimeSettings(state);
  writeJson(res, 200, buildProviderStatus(state));
}

export async function setProviderWeights(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req), source = body.weights && typeof body.weights === "object" && !Array.isArray(body.weights) ? body.weights as Record<string, unknown> : undefined;
  if (!source) return writeJson(res, 400, { error: "invalid_weights" });
  const next: Record<string, number> = {};
  for (const [id, weight] of Object.entries(source)) {
    if (!state.providers.some((item) => item.id === id)) return writeJson(res, 404, { error: "unknown_provider" });
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1000) return writeJson(res, 400, { error: "invalid_weight" });
    next[id] = weight;
  }
  const merged = { ...state.providerWeights, ...next };
  if (body.mode === "distribute" && !hasPositiveDistributionWeight(state, merged)) return writeJson(res, 409, { error: "no_weighted_provider" });
  if (state.routingMode === "distribute" && !hasPositiveDistributionWeight(state, merged)) return writeJson(res, 409, { error: "last_provider_weight" });
  Object.assign(state.providerWeights, next);
  if (body.mode === "manual" || body.mode === "distribute") state.routingMode = body.mode;
  await persistProviderRouting(state);
  writeJson(res, 200, { routingMode: state.routingMode, providers: buildProviderStatus(state) });
}

export async function addProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!/^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(id)) return writeJson(res, 400, { error: "invalid_provider_id" });
  if (id.toLowerCase() === "default") return writeJson(res, 400, { error: "reserved_provider_id" });
  if (state.providers.some((item) => item.id === id)) return writeJson(res, 409, { error: "provider_exists" });
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : id;
  const built = buildProviderFromInput(id, name, body);
  if ("error" in built) return writeJson(res, 400, { error: built.error });
  const previousProviders = state.providers.slice(), previousWeights = { ...state.providerWeights };
  state.providers.push(built.provider);
  state.providerWeights[id] = 1;
  try { await persistRuntimeSettings(state); } catch {
    state.providers = previousProviders;
    state.providerWeights = previousWeights;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, buildProviderStatus(state));
}

export async function updateProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const provider = state.providers.find((item) => item.id === body.id);
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  const before = { ...provider };
  const beforeActive = state.activeProviderId, beforeSelected = state.providerSelectedAt;
  if (typeof body.name === "string" && body.name.trim()) provider.name = body.name.trim().slice(0, 80);
  if (typeof body.target === "string" && body.target.trim()) {
    let nextTarget: string;
    try { nextTarget = validateProviderTarget(body.target.trim(), { path: "provider target", allowPrivate: provider.kind === "local" }); } catch { return writeJson(res, 400, { error: "invalid_target" }); }
    if (originOf(nextTarget) !== originOf(provider.target)) {
      if (hasCredential(provider) && body.clearCredential !== true && body.credential === undefined && body.credentialEnv === undefined) return writeJson(res, 409, { error: "credential_origin_change" });
      provider.credentialValue = undefined;
      provider.credentialEnv = undefined;
      provider.credentialRef = "none";
      provider.authScheme = provider.kind === "local" ? "none" : provider.authScheme;
    }
    provider.target = nextTarget;
  }
  if (typeof body.credentialEnv === "string") {
    const env = body.credentialEnv.trim();
    if (env && !validEnv(env)) return writeJson(res, 400, { error: "invalid_credential_env" });
    provider.credentialEnv = env || undefined; provider.credentialValue = undefined; provider.credentialRef = provider.credentialEnv ? `env:${provider.credentialEnv}` : "none";
  }
  if (typeof body.credential === "string" && body.credential.trim()) { provider.credentialValue = body.credential.trim(); provider.credentialEnv = undefined; provider.credentialRef = "inline"; }
  if (body.clearCredential === true) { provider.credentialValue = undefined; provider.credentialEnv = undefined; provider.credentialRef = "none"; }
  if (typeof body.enabled === "boolean") provider.enabled = body.enabled;
  if (typeof body.allowDistribution === "boolean") provider.allowDistribution = body.allowDistribution;
  repairActiveProvider(state);
  try {
    await persistProviderRouting(state);
    await persistRuntimeAuthProvider(state.dataDir, provider, state.activeProviderId === provider.id, state.routingMode);
  } catch {
    Object.assign(provider, before);
    state.activeProviderId = beforeActive;
    state.providerSelectedAt = beforeSelected;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, buildProviderStatus(state));
}

export async function removeProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  if (id === "default") return writeJson(res, 409, { error: "cannot_remove_default" });
  const index = state.providers.findIndex((item) => item.id === id);
  if (index < 0) return writeJson(res, 404, { error: "unknown_provider" });
  const [removed] = state.providers.splice(index, 1);
  delete state.providerWeights[id];
  repairActiveProvider(state);
  await removeRuntimeAuthProvider(removed);
  await persistProviderRouting(state);
  writeJson(res, 200, buildProviderStatus(state));
}

export async function setRoutingMode(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  if (body.mode !== "manual" && body.mode !== "distribute") return writeJson(res, 400, { error: "invalid_routing_mode" });
  if (body.mode === "distribute" && !hasPositiveDistributionWeight(state)) return writeJson(res, 409, { error: "no_weighted_provider" });
  state.routingMode = body.mode;
  await persistProviderRouting(state);
  writeJson(res, 200, { routingMode: state.routingMode, providers: buildProviderStatus(state) });
}

function buildProviderFromInput(id: string, name: string, body: Record<string, unknown>): { provider: ProviderConfig } | { error: string } {
  const kind = String(body.kind ?? "openai");
  if (!knownKind(kind)) return { error: "invalid_kind" };
  const credential = typeof body.credential === "string" && body.credential.trim() ? body.credential.trim() : undefined;
  const credentialEnv = typeof body.credentialEnv === "string" && body.credentialEnv.trim() ? body.credentialEnv.trim() : undefined;
  if (credentialEnv && !validEnv(credentialEnv)) return { error: "invalid_credential_env" };
  if (kind === "cli-claude" || kind === "cli-codex") {
    const runtime = kind === "cli-codex" ? "codex" : "claude";
    return { provider: { id, name, kind: "cli", target: `cli://${id}`, runtime, cliCommand: runtime, cliArgs: runtime === "codex" ? ["exec"] : ["--print"], cliInputMode: "stdin", authScheme: "none", credentialRef: "none", enabled: true } };
  }
  const target = providerTarget(kind, body);
  const providerKind = kind === "local" || kind === "ollama" ? "local" : "api";
  try { validateProviderTarget(target, { path: "provider target", allowPrivate: providerKind === "local" }); } catch { return { error: "invalid_target" }; }
  const authScheme = kind === "anthropic" ? "x-api-key" : providerKind === "local" ? "none" : credential || credentialEnv ? "bearer" : "none";
  return { provider: { id, name, kind: providerKind, target, authScheme, protocol: providerProtocol(kind), credentialValue: credential, credentialEnv, credentialRef: credential ? "inline" : credentialEnv ? `env:${credentialEnv}` : "none", enabled: true } };
}

function providerTarget(kind: string, body: Record<string, unknown>): string {
  const target = typeof body.target === "string" ? body.target.trim() : "";
  return target || (kind === "ollama" ? "http://127.0.0.1:11434/v1" : "");
}

function providerProtocol(kind: string): ProviderConfig["protocol"] {
  if (kind === "anthropic") return "anthropic-messages";
  if (kind === "ollama") return "ollama-tags";
  if (kind === "local") return "openai-chat";
  return "openai-responses";
}

async function persistProviderRouting(state: RuntimeState): Promise<void> {
  await Promise.all([
    persistRuntimeSettings(state),
    persistRuntimeAuthSelection(state.dataDir, state.activeProviderId, state.routingMode)
  ]);
}

function originOf(target: string): string {
  try { const url = new URL(target); return `${url.protocol}//${url.host}`.toLowerCase(); } catch { return ""; }
}

function hasCredential(provider: ProviderConfig): boolean {
  return Boolean(provider.credentialValue || provider.credentialEnv || (provider.credentialRef && provider.credentialRef !== "none"));
}

function validEnv(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/i.test(value);
}

function knownKind(kind: string): boolean {
  return ["openai", "openai-compatible", "anthropic", "local", "ollama", "cli-claude", "cli-codex"].includes(kind);
}

function hasPositiveDistributionWeight(state: RuntimeState, weights = state.providerWeights): boolean {
  return state.providers.some((provider) => {
    if (!distributionEligible(provider)) return false;
    const weight = typeof weights[provider.id] === "number" ? weights[provider.id] : providerWeight(state, provider.id);
    return weight > 0;
  });
}
