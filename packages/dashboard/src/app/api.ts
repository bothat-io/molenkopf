import type { DashboardData, GlobalPluginPolicyView, Session, TeamPluginPolicyView, TeamView, TokenOptimizerData, EffectivePluginPolicyView as EffectivePolicyView } from "./types";

export type ApiOptions = { signal?: AbortSignal; timeoutMs?: number };

export class ApiError extends Error {
  constructor(public status: number, public code: string, public payload?: unknown) {
    super(code);
  }
}

export async function getJson<T>(path: string, options?: ApiOptions): Promise<T> {
  return requestJson<T>(path, undefined, options);
}

export async function postJson<T>(path: string, body: unknown, options?: ApiOptions): Promise<T> {
  return requestJson<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, options);
}

export async function putJson<T>(path: string, body: unknown, options?: ApiOptions): Promise<T> {
  return requestJson<T>(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, options);
}

async function requestJson<T>(path: string, init?: RequestInit, options: ApiOptions = {}): Promise<T> {
  const timed = withTimeout(init, options);
  let response!: Response;
  try {
    response = await fetch(path, timed.init);
    const payload = await response.json().catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return {};
    });
    if (!response.ok) throw new ApiError(response.status, String((payload as { error?: string }).error || response.status), payload);
    return payload as T;
  } finally {
    timed.clear();
  }
}

export async function loadSession(options?: ApiOptions): Promise<Session> {
  return getJson<Session>("/__molenkopf/me", options).catch((error) => {
    if (error instanceof ApiError && error.status === 401) return {};
    throw error;
  });
}

export async function loadDashboardData(canManage: boolean, options?: ApiOptions): Promise<DashboardData> {
  if (!canManage) {
    const [usage, keys, tokenOptimizer] = await Promise.all([
      getJson<DashboardData["usage"]>("/__molenkopf/usage", options),
      getJson<DashboardData["keys"]>("/__molenkopf/keys", options),
      getJson<TokenOptimizerData>("/__molenkopf/plugins/token-optimizer-plugin/data", options).catch(() => undefined)
    ]);
    return { usage, keys, config: {}, providers: {}, summary: {}, plugins: {}, tokenOptimizer };
  }
  const [usage, keys, config, providers, summary, plugins, identity, globalPolicy, tokenOptimizer] = await Promise.all([
    getJson<DashboardData["usage"]>("/__molenkopf/usage", options),
    getJson<DashboardData["keys"]>("/__molenkopf/keys", options),
    getJson<DashboardData["config"]>("/__molenkopf/config", options),
    getJson<DashboardData["providers"]>("/__molenkopf/providers", options),
    getJson<DashboardData["summary"]>("/__molenkopf/audit/summary", options),
    getJson<DashboardData["plugins"]>("/__molenkopf/plugins", options),
    getJson<DashboardData["identity"]>("/__molenkopf/identity", options),
    getJson<GlobalPluginPolicyView>("/__molenkopf/plugin-policies/global", options).catch(() => undefined),
    getJson<TokenOptimizerData>("/__molenkopf/plugins/token-optimizer-plugin/data", options).catch(() => undefined)
  ]);
  const pluginPolicies = await loadPluginPolicies(identity?.teams || [], options);
  return { usage, keys, config, providers, summary, plugins, identity, pluginPolicies: { global: globalPolicy, ...pluginPolicies }, tokenOptimizer };
}

async function loadPluginPolicies(teams: TeamView[], options?: ApiOptions) {
  const entries = await Promise.all(teams.map(async (team) => {
    const [policy, effective] = await Promise.all([
      getJson<TeamPluginPolicyView>(`/__molenkopf/plugin-policies/teams/${team.id}`, options).catch(() => ({ teamId: team.id, pluginPolicies: {} })),
      getJson<EffectivePolicyView>(`/__molenkopf/plugin-policies/effective/${team.id}`, options).catch(() => ({ teamId: team.id, policies: {} }))
    ]);
    return [team.id, { policy, effective }] as const;
  }));
  return {
    teams: Object.fromEntries(entries.map(([teamId, value]) => [teamId, value.policy])),
    effective: Object.fromEntries(entries.map(([teamId, value]) => [teamId, value.effective]))
  };
}

function withTimeout(init: RequestInit | undefined, options: ApiOptions): { init: RequestInit; clear: () => void } {
  if (!options.timeoutMs && !options.signal) return { init: init ?? {}, clear: () => {} };
  if (!options.timeoutMs) return { init: { ...init, signal: options.signal }, clear: () => {} };
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = globalThis.setTimeout(abort, options.timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) abort();
    else options.signal.addEventListener("abort", abort, { once: true });
  }
  return {
    init: { ...init, signal: controller.signal },
    clear: () => {
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
}
