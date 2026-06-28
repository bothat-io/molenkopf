import type { IncomingMessage } from "node:http";
import type { RuntimeState } from "./runtime-types.ts";
import { isLoopbackBindHost } from "./public-bind.ts";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ControlPlaneGuardResult = { ok: true } | { ok: false; status: number; error: string };

export function checkControlPlaneWrite(req: IncomingMessage, path: string, state: RuntimeState): ControlPlaneGuardResult {
  if (!WRITE_METHODS.has(req.method ?? "GET")) return { ok: true };
  if (!originAllowed(req.headers.origin, req.headers.host, process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN)) {
    return { ok: false, status: 403, error: "bad_origin" };
  }
  if (!req.headers.origin && !isLoopbackBindHost(state.host) && hasSessionCookie(req.headers.cookie)) {
    return { ok: false, status: 403, error: "bad_origin" };
  }
  if (!isJsonContentType(req.headers["content-type"])) {
    return { ok: false, status: 415, error: "json_required" };
  }
  return { ok: true };
}

function hasSessionCookie(value: string | string[] | undefined): boolean {
  return typeof value === "string" && /(?:^|;\s*)molenkopf_session=/.test(value);
}

function originAllowed(origin: string | string[] | undefined, host: string | string[] | undefined, dashboardDevOrigin?: string): boolean {
  if (!origin) return true;
  if (Array.isArray(origin) || Array.isArray(host) || !host) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.host.toLowerCase() === host.toLowerCase()) return true;
    if (!dashboardDevOrigin) return false;
    const allowedDev = new URL(dashboardDevOrigin);
    return parsed.protocol === allowedDev.protocol && sameOriginHost(parsed, allowedDev);
  } catch {
    return false;
  }
}

function sameOriginHost(actual: URL, expected: URL): boolean {
  if (actual.host.toLowerCase() === expected.host.toLowerCase()) return true;
  return actual.port === expected.port && isLoopbackName(actual.hostname) && isLoopbackName(expected.hostname);
}

function isLoopbackName(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}

function isJsonContentType(value: string | string[] | undefined): boolean {
  if (Array.isArray(value) || !value) return false;
  const mediaType = value.split(";")[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}
