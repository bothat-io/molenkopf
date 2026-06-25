export type ConnectionStatus = "connected" | "syncing" | "offline";
export type RefreshState = { loading: boolean; lastSuccessAt?: string; lastErrorAt?: string; error?: string };

export function connectionStatus(state: RefreshState): ConnectionStatus {
  if (state.loading) return "syncing";
  if (state.lastErrorAt && (!state.lastSuccessAt || state.lastErrorAt > state.lastSuccessAt)) return "offline";
  return "connected";
}

export function shouldPollDashboard(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState !== "hidden";
}
