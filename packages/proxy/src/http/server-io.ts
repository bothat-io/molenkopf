import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";

export class HttpInputError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function listen(server: ReturnType<typeof createServer>, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

export function readBody(req: IncomingMessage, timeoutMs = bodyTimeoutMs(), maxBytes = bodyLimitBytes()): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => fail(new Error(`request body timed out after ${timeoutMs}ms`)), timeoutMs);
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) return fail(new HttpInputError(413, "request_body_too_large"));
      chunks.push(Buffer.from(chunk));
    });
    req.on("aborted", () => fail(new Error("request body aborted")));
    req.on("close", () => { if (!req.complete) fail(new Error("request body aborted")); });
    req.on("error", fail);
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    function done(value: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }
    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

export function inputError(error: unknown): { status: number; code: string } | undefined {
  return error instanceof HttpInputError ? { status: error.status, code: error.code } : undefined;
}

function bodyTimeoutMs(): number {
  const configured = Number(process.env.MOLENKOPF_REQUEST_BODY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 30000;
}

function bodyLimitBytes(): number {
  const configured = Number(process.env.MOLENKOPF_PROXY_BODY_LIMIT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 32 * 1024 * 1024;
}

export function writeJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

export function writeRedirect(res: ServerResponse, location: string) {
  res.writeHead(302, { location });
  res.end();
}
