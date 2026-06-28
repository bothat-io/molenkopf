import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { distributionEligible, providerWeight } from "./runtime-state.ts";
import type { RuntimeState } from "./runtime-types.ts";
import { persistRuntimeAuthSelection } from "./runtime-auth-registry.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import { isLocalProviderCredentialRef, removeLocalProviderCredential, storeLocalProviderCredential } from "./provider-credential-store.ts";
import { restoreProviderRouting, snapshotProviderRouting, type ProviderRoutingSnapshot } from "./provider-routing-snapshot.ts";

export async function persistProviderRouting(state: RuntimeState, previous?: ProviderRoutingSnapshot): Promise<void> {
  await persistRuntimeSettings(state);
  try {
    await persistRuntimeAuthSelection(state.dataDir, state.activeProviderId, state.routingMode);
  } catch (error) {
    if (previous) await restoreRuntimeSettingsFile(state, previous).catch(() => {});
    throw error;
  }
}

async function restoreRuntimeSettingsFile(state: RuntimeState, previous: ProviderRoutingSnapshot): Promise<void> {
  const current = snapshotProviderRouting(state);
  restoreProviderRouting(state, previous);
  try { await persistRuntimeSettings(state); } finally { restoreProviderRouting(state, current); }
}

export function originOf(target: string): string {
  try { const url = new URL(target); return `${url.protocol}//${url.host}`.toLowerCase(); } catch { return ""; }
}

export function hasCredential(provider: ProviderConfig): boolean {
  return Boolean(provider.credentialValue || provider.credentialEnv || (provider.credentialRef && provider.credentialRef !== "none"));
}

export function hasPositiveDistributionWeight(state: RuntimeState, weights = state.providerWeights): boolean {
  return state.providers.some((provider) => {
    if (!distributionEligible(provider)) return false;
    const weight = typeof weights[provider.id] === "number" ? weights[provider.id] : providerWeight(state, provider.id);
    return weight > 0;
  });
}

export async function restoreLocalCredential(dataDir: string | undefined, provider: ProviderConfig): Promise<void> {
  if (isLocalProviderCredentialRef(provider.credentialRef, provider.id) && provider.credentialValue) await storeLocalProviderCredential(dataDir, provider, provider.credentialValue);
  else await removeLocalProviderCredential(dataDir, provider.id).catch(() => {});
}
