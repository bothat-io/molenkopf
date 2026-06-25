import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, loadSession, postJson } from "./api";

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

  it("treats unauthorized session load as anonymous", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })));
    await expect(loadSession()).resolves.toEqual({});
  });
});
