import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type TargetPolicy = { allowPrivate?: boolean; allowSearch?: boolean; path?: string };
export type ConnectTarget = { url: URL; address: string; family: 4 | 6 };

export function validateProviderTarget(value: string, policy: TargetPolicy = {}): string {
  const url = parseHttpTarget(value, policy.path ?? "target");
  if (url.username || url.password || (!policy.allowSearch && url.search)) throw new Error(`unsafe URL: ${policy.path ?? "target"}`);
  if (!policy.allowPrivate && isPrivateHost(url.hostname)) throw new Error(`unsafe private URL: ${policy.path ?? "target"}`);
  return value;
}

export async function resolveConnectTarget(value: string, policy: TargetPolicy = {}): Promise<ConnectTarget> {
  const url = parseHttpTarget(value, policy.path ?? "target");
  if (url.username || url.password || (!policy.allowSearch && url.search)) throw new Error(`unsafe URL: ${policy.path ?? "target"}`);
  const resolved = await lookup(url.hostname, { all: true, verbatim: true });
  if (!policy.allowPrivate && resolved.some((item) => isPrivateHost(item.address))) throw new Error(`unsafe private URL: ${policy.path ?? "target"}`);
  const first = resolved[0];
  if (!first) throw new Error(`invalid URL: ${policy.path ?? "target"}`);
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "metadata.google.internal") return true;
  const ip = isIP(host);
  if (ip === 6) return isPrivateIpv6(host);
  if (ip === 4) return isPrivateIpv4(host);
  return false;
}

function parseHttpTarget(value: string, path: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`invalid URL: ${path}`); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`invalid URL protocol: ${path}`);
  return url;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isPrivateIpv6(host: string): boolean {
  if (host === "::" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("::ffff:")) return isPrivateIpv4(ipv4Mapped(host));
  return false;
}

function ipv4Mapped(host: string): string {
  const tail = host.slice("::ffff:".length);
  if (tail.includes(".")) return tail;
  const groups = tail.split(":").map((part) => Number.parseInt(part || "0", 16));
  const number = ((groups[0] ?? 0) << 16) + (groups[1] ?? 0);
  return [(number >>> 24) & 255, (number >>> 16) & 255, (number >>> 8) & 255, number & 255].join(".");
}
