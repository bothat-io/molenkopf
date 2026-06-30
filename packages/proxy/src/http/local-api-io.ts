import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { CONTROL_PLANE_LIMITS } from "./runtime-types.ts";

export class LocalApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function readJson(req: IncomingMessage, maxBytes = CONTROL_PLANE_LIMITS.requestBodyBytes, timeoutMs = localApiBodyTimeoutMs()): Promise<Record<string, unknown>> {
  const body = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => fail(new LocalApiError(408, "json_timeout")), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", onData);
      req.off("error", onError);
      req.off("end", onEnd);
      req.off("aborted", onAborted);
      req.off("close", onClose);
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
    const onAborted = () => fail(new LocalApiError(400, "json_aborted"));
    const onClose = () => { if (!req.complete) fail(new LocalApiError(400, "json_aborted")); };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    req.on("data", onData);
    req.on("error", onError);
    req.on("end", onEnd);
    req.on("aborted", onAborted);
    req.on("close", onClose);
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

function localApiBodyTimeoutMs(): number {
  const configured = Number(process.env.MOLENKOPF_REQUEST_BODY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 30000;
}

export function writeJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, jsonHeaders());
  res.end(JSON.stringify(data));
}

export function jsonHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return securityHeaders({ "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", expires: "0", ...headers });
}

export function writeHtml(res: ServerResponse, html: string): void {
  const nonce = randomBytes(16).toString("base64");
  res.writeHead(200, securityHeaders({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'none'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join("; "),
  }));
  res.end(addScriptNonce(html, nonce));
}

function addScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`);
}

function securityHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff"
  };
}
