import type { DashboardData, Session } from "./types";

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
  const [usage, keys, config] = await Promise.all([
    getJson<DashboardData["usage"]>("/__molenkopf/usage", options),
    getJson<DashboardData["keys"]>("/__molenkopf/keys", options),
    getJson<DashboardData["config"]>("/__molenkopf/config", options)
  ]);
  if (!canManage) return { usage, keys, config, providers: {}, summary: {}, plugins: {} };
  const [providers, summary, plugins, identity] = await Promise.all([
    getJson<DashboardData["providers"]>("/__molenkopf/providers", options),
    getJson<DashboardData["summary"]>("/__molenkopf/audit/summary", options),
    getJson<DashboardData["plugins"]>("/__molenkopf/plugins", options),
    getJson<DashboardData["identity"]>("/__molenkopf/identity", options)
  ]);
  return { usage, keys, config, providers, summary, plugins, identity };
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
