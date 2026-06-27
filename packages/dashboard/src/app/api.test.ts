import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, loadDashboardData, loadSession, postJson, putJson } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("api helpers", () => {
  it("throws ApiError with status code and payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bad_request" }), { status: 400 })));
    await expect(getJson("/bad")).rejects.toMatchObject(new ApiError(400, "bad_request", { error: "bad_request" }));
  });

  it("posts JSON bodies", async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(postJson("/save", { a: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: 1 }) });
  });

  it("puts JSON bodies", async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(putJson("/save", { a: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/save", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: 1 }) });
  });

  it("passes abort signals to requests", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getJson("/ok", { signal: controller.signal })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("aborts timed out requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_path, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const promise = getJson("/slow", { timeoutMs: 10 });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    vi.useRealTimers();
  });

  it("keeps timeout active while reading the JSON body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_path, init) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        (init as RequestInit).signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })
    })));
    const promise = getJson("/slow-body", { timeoutMs: 10 });
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    vi.useRealTimers();
  });

  it("treats unauthorized session load as signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })));
    await expect(loadSession()).resolves.toEqual({});
  });

  it("loads non-admin dashboard data without admin-only config", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL) => {
      const key = String(path);
      calls.push(key);
      if (key === "/__molenkopf/usage") return json({ users: [] });
      if (key === "/__molenkopf/keys") return json({ items: [] });
      if (key === "/__molenkopf/config") return json({ error: "forbidden" }, 403);
      return json({ error: "not_found" }, 404);
    }));
    await expect(loadDashboardData(false)).resolves.toEqual({
      usage: { users: [] },
      keys: { items: [] },
      config: {},
      providers: {},
      summary: {},
      plugins: {},
      tokenOptimizer: undefined
    });
    expect(calls).toEqual(["/__molenkopf/usage", "/__molenkopf/keys", "/__molenkopf/plugins/token-optimizer-plugin/data"]);
  });

  it("loads full dashboard data for admins", async () => {
    const calls: string[] = [];
    const payloads: Record<string, unknown> = {
      "/__molenkopf/usage": { users: [] },
      "/__molenkopf/keys": { items: [] },
      "/__molenkopf/config": { port: 8787 },
      "/__molenkopf/providers": { items: [] },
      "/__molenkopf/audit/summary": { requests: 0 },
      "/__molenkopf/plugins": { items: [] },
      "/__molenkopf/identity": { users: [], teams: [] },
      "/__molenkopf/plugin-policies/global": { globalPluginPolicy: {} },
      "/__molenkopf/plugins/token-optimizer-plugin/data": { recommendations: [] }
    };
    vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL) => {
      const key = String(path);
      calls.push(key);
      return json(payloads[key] ?? { error: "not_found" }, payloads[key] ? 200 : 404);
    }));
    await expect(loadDashboardData(true)).resolves.toMatchObject({
      config: { port: 8787 },
      providers: { items: [] },
      summary: { requests: 0 },
      plugins: { items: [] },
      identity: { users: [], teams: [] },
      tokenOptimizer: { recommendations: [] }
    });
    expect(calls).toEqual(Object.keys(payloads));
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}
