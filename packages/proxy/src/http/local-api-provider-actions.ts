import type { IncomingMessage, ServerResponse } from "node:http";
import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { distributionEligible, providerWeight, repairActiveProvider } from "./runtime-state.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { buildProviderStatus } from "./local-api-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeAuthProvider, persistRuntimeAuthSelection, removeRuntimeAuthProvider } from "./runtime-auth-registry.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import { restoreProviderRouting, snapshotProviderRouting } from "./provider-routing-snapshot.ts";
import { buildProviderFromInput, validEnv } from "./provider-input.ts";

export async function selectProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const provider = state.providers.find((item) => item.id === id);
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  if (provider.enabled === false) return writeJson(res, 409, { error: "provider_disabled" });
  const previous = snapshotProviderRouting(state);
  state.activeProviderId = provider.id;
  state.providerSelectedAt = new Date().toISOString();
  try { await persistProviderRouting(state); } catch {
    restoreProviderRouting(state, previous);
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, buildProviderStatus(state));
}

export async function setProviderWeight(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "", provider = state.providers.find((item) => item.id === id);
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  if (typeof body.weight !== "number" || !Number.isFinite(body.weight) || body.weight < 0 || body.weight > 1000) return writeJson(res, 400, { error: "invalid_weight" });
  const weights = { ...state.providerWeights, [id]: body.weight };
  if (distributionEligible(provider) && !hasPositiveDistributionWeight(state, weights)) return writeJson(res, 409, { error: "last_provider_weight" });
  const previous = snapshotProviderRouting(state);
  state.providerWeights[id] = body.weight;
  try { await persistRuntimeSettings(state); } catch {
    restoreProviderRouting(state, previous);
    return writeJson(res, 500, { error: "persist_failed" });
  }
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
  const previous = snapshotProviderRouting(state);
  Object.assign(state.providerWeights, next);
  if (body.mode === "manual" || body.mode === "distribute") state.routingMode = body.mode;
  try { await persistProviderRouting(state); } catch {
    restoreProviderRouting(state, previous);
    return writeJson(res, 500, { error: "persist_failed" });
  }
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
  const previous = snapshotProviderRouting(state);
  const [removed] = state.providers.splice(index, 1);
  delete state.providerWeights[id];
  repairActiveProvider(state);
  try { await persistProviderRouting(state); } catch {
    restoreProviderRouting(state, previous);
    return writeJson(res, 500, { error: "persist_failed" });
  }
  try { await removeRuntimeAuthProvider(removed); } catch {
    return writeJson(res, 500, { error: "remove_failed" });
  }
  writeJson(res, 200, buildProviderStatus(state));
}

export async function setRoutingMode(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  if (body.mode !== "manual" && body.mode !== "distribute") return writeJson(res, 400, { error: "invalid_routing_mode" });
  if (body.mode === "distribute" && !hasPositiveDistributionWeight(state)) return writeJson(res, 409, { error: "no_weighted_provider" });
  const previous = snapshotProviderRouting(state);
  state.routingMode = body.mode;
  try { await persistProviderRouting(state); } catch {
    restoreProviderRouting(state, previous);
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, { routingMode: state.routingMode, providers: buildProviderStatus(state) });
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

function hasPositiveDistributionWeight(state: RuntimeState, weights = state.providerWeights): boolean {
  return state.providers.some((provider) => {
    if (!distributionEligible(provider)) return false;
    const weight = typeof weights[provider.id] === "number" ? weights[provider.id] : providerWeight(state, provider.id);
    return weight > 0;
  });
}
