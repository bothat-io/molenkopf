import { request as httpRequest, type ServerResponse, type OutgoingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolveConnectTarget } from "../../../core/src/security/target-policy.ts";

// Transparent streaming proxy: forward to upstream and stream the response
// straight back to the client, preserving status, headers, and encoding
// byte-for-byte. Node built-ins only (no fetch — fetch auto-decodes gzip and
// would break transparency for streaming/compressed responses).

export type StreamObserver = {
  onResponseHead?: (statusCode: number, headers: OutgoingHttpHeaders) => void;
  onResponseBody?: (chunk: Buffer) => void;
  timeoutMs?: number;
  allowPrivateTarget?: boolean;
};
export type ForwardResult = { statusCode: number };

export async function forwardStream(res: ServerResponse, target: string, rawPath: string, method: string, headers: Headers, body: string | undefined, observer: StreamObserver = {}): Promise<ForwardResult> {
  const upstream = new URL(originFormTarget(rawPath), target.endsWith("/") ? target : `${target}/`);
  const checked = await resolveConnectTarget(upstream.toString(), { path: "provider target", allowPrivate: observer.allowPrivateTarget, allowSearch: true });
  const transport = checked.url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<ForwardResult>((resolve, reject) => {
    const timeoutMs = observer.timeoutMs ?? upstreamTimeoutMs();
    let settled = false;
    const done = (value: ForwardResult) => { if (!settled) { settled = true; resolve(value); } };
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    const upstreamReq = transport(checked.url, { method, headers: toOutgoingHeaders(headers, checked.url.host), lookup: pinnedLookup(checked.address, checked.family) }, (upstreamRes) => {
      const statusCode = upstreamRes.statusCode ?? 502;
      const safeHeaders = filterResponseHeaders(upstreamRes.headers);
      observer.onResponseHead?.(statusCode, safeHeaders);
      res.writeHead(statusCode, safeHeaders);
      if (observer.onResponseBody) upstreamRes.on("data", (chunk: Buffer | string) => observer.onResponseBody?.(toBuffer(chunk)));
      upstreamRes.on("end", () => done({ statusCode }));
      upstreamRes.on("aborted", () => fail(new Error("upstream response aborted")));
      upstreamRes.on("error", fail);
      upstreamRes.pipe(res);
    });
    upstreamReq.setTimeout(timeoutMs, () => upstreamReq.destroy(new Error(`upstream timed out after ${timeoutMs}ms`)));
    upstreamReq.on("error", fail);
    res.on("close", () => { if (!res.writableEnded) upstreamReq.destroy(); });
    if (body) upstreamReq.end(body);
    else upstreamReq.end();
  });
}

function pinnedLookup(address: string, family: 4 | 6) {
  return (_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
    callback(null, address, family);
  };
}

function upstreamTimeoutMs(): number {
  const configured = Number(process.env.MOLENKOPF_UPSTREAM_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
}

function originFormTarget(rawPath: string): string {
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) {
    throw new Error("invalid_request_target");
  }
  return rawPath;
}

function toOutgoingHeaders(headers: Headers, host: string): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {};
  headers.forEach((value, key) => { out[key] = value; });
  out.host = host;
  return out;
}

function filterResponseHeaders(headers: OutgoingHttpHeaders): OutgoingHttpHeaders {
  const blocked = new Set([
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade", "set-cookie",
    "content-security-policy", "content-security-policy-report-only",
    "cross-origin-opener-policy", "cross-origin-resource-policy",
    "cross-origin-embedder-policy", "permissions-policy"
  ]);
  const out: OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!blocked.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

function toBuffer(chunk: Buffer | string): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk) : chunk;
}
