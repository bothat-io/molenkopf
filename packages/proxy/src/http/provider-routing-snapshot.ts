import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import type { RoutingMode, RuntimeState } from "./runtime-types.ts";

export type ProviderRoutingSnapshot = {
  providers: ProviderConfig[];
  providerWeights: Record<string, number>;
  activeProviderId: string;
  providerSelectedAt?: string;
  routingMode: RoutingMode;
};

export function snapshotProviderRouting(state: RuntimeState): ProviderRoutingSnapshot {
  return {
    providers: state.providers.map(copyProvider),
    providerWeights: { ...state.providerWeights },
    activeProviderId: state.activeProviderId,
    providerSelectedAt: state.providerSelectedAt,
    routingMode: state.routingMode
  };
}

export function restoreProviderRouting(state: RuntimeState, snapshot: ProviderRoutingSnapshot): void {
  state.providers = snapshot.providers;
  state.providerWeights = snapshot.providerWeights;
  state.activeProviderId = snapshot.activeProviderId;
  state.providerSelectedAt = snapshot.providerSelectedAt;
  state.routingMode = snapshot.routingMode;
}

function copyProvider(provider: ProviderConfig): ProviderConfig {
  return { ...provider, cliArgs: provider.cliArgs ? [...provider.cliArgs] : undefined };
}
