import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardRoot = resolve(here, "..", "..", "..", "dashboard");
const defaultDist = join(dashboardRoot, "dist");
const routePrefix = "/__molenkopf/dashboard";

export function isDashboardRequest(url: string | undefined): boolean {
  const path = routePath(url);
  return path === routePrefix || path.startsWith(`${routePrefix}/`);
}

export async function handleDashboardRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = parsePath(req.url);
  if (req.method !== "GET" && req.method !== "HEAD") {
    writeText(res, 405, "method not allowed");
    return;
  }
  const devOrigin = process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN;
  if (devOrigin) {
    await proxyDevDashboard(req, res, devOrigin);
    return;
  }
  if (!path) return writeText(res, 400, "bad request");
  if (path.startsWith(`${routePrefix}/assets/`)) return serveDistPath(path.slice(routePrefix.length + 1), true, res);
  if (path === `${routePrefix}/favicon.png` || path === `${routePrefix}/molenkopf-logo.png`) return serveDistPath(path.slice(routePrefix.length + 1), true, res);
  if (hasExtension(path)) return writeText(res, 404, "not found");
  return serveIndex(res);
}

export async function handleDashboardFaviconRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") { writeText(res, 405, "method not allowed"); return; }
  const devOrigin = process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN;
  if (devOrigin) { await proxyDevDashboard(req, res, devOrigin, `${routePrefix}/favicon.png`); return; }
  serveDistPath("favicon.png", true, res);
}

async function serveIndex(res: ServerResponse) {
  const file = join(distDir(), "index.html");
  if (!existsSync(file)) return writeText(res, 503, missingBuildHtml(), "text/html; charset=utf-8");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(await readFile(file));
}

function serveDistPath(routePath: string, immutable: boolean, res: ServerResponse) {
  const safe = safeRelative(routePath);
  if (!safe) return writeText(res, 400, "bad request");
  const file = normalize(join(distDir(), safe));
  const root = distDir();
  if (!(file.startsWith(`${root}${sep}`)) || !existsSync(file)) return writeText(res, 404, "not found");
  res.writeHead(200, { "content-type": contentType(file), "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-store" });
  createReadStream(file).pipe(res);
}

async function proxyDevDashboard(req: IncomingMessage, res: ServerResponse, origin: string, overridePath?: string) {
  try {
    const incoming = parseIncoming(req.url);
    if (!incoming) return writeText(res, 400, "bad request");
    const target = new URL(`${overridePath ?? incoming.pathname}${overridePath ? "" : incoming.search}`, origin);
    if (target.pathname === routePrefix) target.pathname = `${routePrefix}/`;
    const upstream = await fetch(target, { method: req.method });
    const headers: Record<string, string> = {};
    upstream.headers.forEach((value, key) => { headers[key] = value; });
    res.writeHead(upstream.status, headers);
    if (req.method === "HEAD") return res.end();
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    writeText(res, 503, "dashboard dev server is starting");
  }
}

function parseIncoming(url: string | undefined): URL | undefined {
  const raw = url ?? "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return undefined;
  try { return new URL(raw, "http://local"); } catch { return undefined; }
}

function parsePath(url: string | undefined): string {
  return parseIncoming(url)?.pathname ?? "";
}

function routePath(url: string | undefined): string {
  try { return new URL(url ?? "/", "http://local").pathname; } catch { return ""; }
}

function safeRelative(routePath: string): string | undefined {
  let decoded: string;
  try { decoded = decodeURIComponent(routePath); } catch { return undefined; }
  if (!decoded || decoded.includes("\\") || decoded.split("/").some((part) => !part || part === "." || part === "..")) return undefined;
  return decoded;
}

function hasExtension(path: string): boolean {
  return /\/[^/]+\.[a-z0-9]+$/i.test(path);
}

function distDir() {
  return process.env.MOLENKOPF_DASHBOARD_DIST || defaultDist;
}

function contentType(file: string): string {
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".ico")) return "image/x-icon";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function writeText(res: ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function missingBuildHtml() {
  return "<!doctype html><html><body><div id=\"root\">Dashboard build missing. Run npm --prefix packages/dashboard run build.</div></body></html>";
}
