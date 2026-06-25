import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Stateless signed session tokens: base64(userId.expiry).hmac. No DB needed; the
// server secret is generated at startup (or supplied via env) and the token is
// carried in an httpOnly cookie.

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;
export type SessionPayload = { userId: string; sessionVersion: number };

export function newSessionSecret(): string {
  return randomBytes(32).toString("hex");
}

export function signSession(userId: string, secret: string, ttlMs = DEFAULT_TTL_MS, now = Date.now(), sessionVersion = 0): string {
  const body = Buffer.from(JSON.stringify({ u: userId, v: sessionVersion, e: now + ttlMs })).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): string | undefined {
  return verifySessionPayload(token, secret, now)?.userId;
}

export function verifySessionPayload(token: string | undefined, secret: string, now = Date.now()): SessionPayload | undefined {
  if (!token || !token.includes(".")) return undefined;
  const [body, sig] = token.split(".");
  if (!body || !sig || !equals(sig, hmac(body, secret))) return undefined;
  const decoded = Buffer.from(body, "base64url").toString("utf8");
  const payload = parsePayload(decoded);
  if (!payload) return undefined;
  const { userId, sessionVersion, expiry } = payload;
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) return undefined;
  if (!Number.isFinite(expiry) || expiry < now) return undefined;
  return { userId, sessionVersion };
}

function parsePayload(decoded: string): (SessionPayload & { expiry: number }) | undefined {
  if (decoded.startsWith("{")) {
    try {
      const parsed = JSON.parse(decoded) as { u?: unknown; v?: unknown; e?: unknown };
      if (typeof parsed.u === "string") return { userId: parsed.u, sessionVersion: Number(parsed.v), expiry: Number(parsed.e) };
    } catch {
      return undefined;
    }
  }
  const parts = decoded.split(".");
  if (parts.length < 2) return undefined;
  const expiry = Number(parts.at(-1));
  const maybeVersion = Number(parts.at(-2));
  if (parts.length >= 3 && Number.isSafeInteger(maybeVersion) && maybeVersion >= 0) {
    return { userId: parts.slice(0, -2).join("."), sessionVersion: maybeVersion, expiry };
  }
  return { userId: parts.slice(0, -1).join("."), sessionVersion: 0, expiry };
}

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function equals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
