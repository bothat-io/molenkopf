import type { IncomingMessage, ServerResponse } from "node:http";
import { distributionEligible, repairActiveProvider } from "./runtime-state.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { buildProviderStatus } from "./local-api-state.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { deleteRuntimeAuthQuarantine, persistRuntimeAuthProvider, quarantineRuntimeAuthProvider, restoreRuntimeAuthQuarantine } from "./runtime-auth-registry.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import { restoreProviderRouting, snapshotProviderRouting } from "./provider-routing-snapshot.ts";
import { buildProviderFromInput } from "./provider-input.ts";
import { prepareProviderUpdate } from "./provider-update.ts";
import { isLocalProviderCredentialRef, removeLocalProviderCredential, storeLocalProviderCredential } from "./provider-credential-store.ts";
import { hasPositiveDistributionWeight, persistProviderRouting, restoreLocalCredential } from "./provider-action-helpers.ts";

export async function selectProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const provider = state.providers.find((item) => item.id === id);
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  if (provider.enabled === false) return writeJson(res, 409, { error: "provider_disabled" });
  const previous = snapshotProviderRouting(state);
  state.activeProviderId = provider.id;
  state.providerSelectedAt = new Date().toISOString();
  try { await persistProviderRouting(state, previous); } catch {
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
  try { await persistProviderRouting(state, previous); } catch {
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
  let storedCredential = false;
  try {
    if (built.provider.credentialValue) {
      await storeLocalProviderCredential(state.dataDir, built.provider, built.provider.credentialValue);
      storedCredential = true;
    }
    state.providers.push(built.provider);
    state.providerWeights[id] = 1;
    await persistRuntimeSettings(state);
  } catch {
    state.providers = previousProviders;
    state.providerWeights = previousWeights;
    if (storedCredential) await removeLocalProviderCredential(state.dataDir, id).catch(() => {});
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, buildProviderStatus(state));
}

export async function updateProvider(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const body = await readJson(req);
  const index = state.providers.findIndex((item) => item.id === body.id);
  const provider = state.providers[index];
  if (!provider) return writeJson(res, 404, { error: "unknown_provider" });
  const update = prepareProviderUpdate(provider, body);
  if (update.ok === false) return writeJson(res, update.status, { error: update.error });
  const previous = snapshotProviderRouting(state);
  const before = { ...provider };
  const beforeLocalCredential = isLocalProviderCredentialRef(before.credentialRef, before.id);
  state.providers[index] = update.provider;
  repairActiveProvider(state);
  let storedNewCredential = false;
  try {
    if (update.nextCredential) {
      await storeLocalProviderCredential(state.dataDir, update.provider, update.nextCredential);
      storedNewCredential = true;
    }
    await persistProviderRouting(state, previous);
    await persistRuntimeAuthProvider(state.dataDir, update.provider, state.activeProviderId === update.provider.id, state.routingMode);
    if (beforeLocalCredential && !isLocalProviderCredentialRef(update.provider.credentialRef, update.provider.id)) await removeLocalProviderCredential(state.dataDir, before.id);
  } catch {
    restoreProviderRouting(state, previous);
    if (storedNewCredential) await restoreLocalCredential(state.dataDir, before);
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
  const removing = state.providers[index];
  let quarantine;
  try { quarantine = await quarantineRuntimeAuthProvider(removing); } catch {
    return writeJson(res, 500, { error: "remove_failed" });
  }
  const previous = snapshotProviderRouting(state);
  const [removed] = state.providers.splice(index, 1);
  delete state.providerWeights[id];
  repairActiveProvider(state);
  try { await persistProviderRouting(state, previous); } catch {
    restoreProviderRouting(state, previous);
    await restoreRuntimeAuthQuarantine(quarantine).catch(() => {});
    return writeJson(res, 500, { error: "persist_failed" });
  }
  try {
    await deleteRuntimeAuthQuarantine(quarantine);
    if (isLocalProviderCredentialRef(removed.credentialRef, removed.id)) await removeLocalProviderCredential(state.dataDir, removed.id);
  } catch {
    restoreProviderRouting(state, previous);
    await persistProviderRouting(state).catch(() => {});
    await restoreRuntimeAuthQuarantine(quarantine).catch(() => {});
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
  try { await persistProviderRouting(state, previous); } catch {
    restoreProviderRouting(state, previous);
    return writeJson(res, 500, { error: "persist_failed" });
  }
  writeJson(res, 200, { routingMode: state.routingMode, providers: buildProviderStatus(state) });
}
