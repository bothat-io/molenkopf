import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import type { RoutingMode, RuntimeState } from "./runtime-types.ts";

type Snapshot = {
  providers: ProviderConfig[];
  providerWeights: Record<string, number>;
  activeProviderId: string;
  providerSelectedAt?: string;
  routingMode: RoutingMode;
};

export function snapshotProviderRouting(state: RuntimeState): Snapshot {
  return {
    providers: state.providers.slice(),
    providerWeights: { ...state.providerWeights },
    activeProviderId: state.activeProviderId,
    providerSelectedAt: state.providerSelectedAt,
    routingMode: state.routingMode
  };
}

export function restoreProviderRouting(state: RuntimeState, snapshot: Snapshot): void {
  state.providers = snapshot.providers;
  state.providerWeights = snapshot.providerWeights;
  state.activeProviderId = snapshot.activeProviderId;
  state.providerSelectedAt = snapshot.providerSelectedAt;
  state.routingMode = snapshot.routingMode;
}
