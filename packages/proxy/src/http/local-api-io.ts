import type { IncomingMessage, ServerResponse } from "node:http";
import { CONTROL_PLANE_LIMITS } from "./runtime-state.ts";

export class LocalApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(req: IncomingMessage, maxBytes = CONTROL_PLANE_LIMITS.requestBodyBytes): Promise<Record<string, unknown>> {
  const body = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      req.off("data", onData);
      req.off("error", onError);
      req.off("end", onEnd);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.pause();
      reject(error);
    };
    const onData = (chunk: string | Buffer) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxBytes) return fail(new LocalApiError(413, "json_too_large"));
      chunks.push(buffer);
    };
    const onError = (error: Error) => fail(error);
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    req.on("data", onData);
    req.on("error", onError);
    req.on("end", onEnd);
  });
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    return parsed as Record<string, unknown>;
  } catch {
    throw new LocalApiError(400, "invalid_json");
  }
}

export function writeJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, jsonHeaders());
  res.end(JSON.stringify(data));
}

export function jsonHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return securityHeaders({ "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", expires: "0", ...headers });
}

export function writeHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, securityHeaders({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  }));
  res.end(html);
}

function securityHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  };
}
