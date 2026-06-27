import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyPasswordAsync, hashPasswordAsync, passwordTooLong } from "../../../core/src/auth/password.ts";
import { signSession } from "../../../core/src/auth/session.ts";
import type { User } from "../../../core/src/identity/types.ts";
import { authRequired, canManage, currentUser } from "./auth-state.ts";
import { type RuntimeState } from "./runtime-state.ts";
import { jsonHeaders, readJson, writeJson } from "./local-api-io.ts";
import { isValidUserId } from "./identity-id.ts";
import { MIN_PASSWORD_LENGTH } from "./password-policy.ts";

// Session login backed by the Identity store. Passwords are scrypt-hashed; the
// session is a signed httpOnly cookie. canManage/teams come from the user's role.
const COOKIE = "molenkopf_session";
const MAX_AUTH_FAILURES = 5;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

export async function login(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  const attemptId = attemptKey("login", req, "");
  if (rateLimited(state, attemptId)) return writeJson(res, 429, { error: "too_many_attempts" });
  const body = await readJson(req);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const user = state.identity?.getUser(username);
  if (passwordTooLong(password) || !user || user.disabled || user.loginDisabled || !await verifyPasswordAsync(password, user.password)) {
    recordFailure(state, attemptId);
    recordFailure(state, attemptKey("login", req, username));
    return writeJson(res, 401, { error: "invalid_login" });
  }
  clearFailures(state, attemptId);
  clearFailures(state, attemptKey("login", req, username));
  const token = signSession(user.id, state.sessionSecret, undefined, undefined, user.sessionVersion ?? 0);
  res.writeHead(200, authHeaders(req, `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`));
  res.end(JSON.stringify({ ok: true, user: meView(state, user) }));
}

export function logout(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, authHeaders(req, `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`));
  res.end(JSON.stringify({ ok: true }));
}

export function me(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  if (!authRequired(state)) return writeJson(res, 200, { open: true, canManage: true, needsSetup: true });
  const user = currentUser(state, req.headers.cookie ?? null);
  if (!user) return writeJson(res, 200, {});
  writeJson(res, 200, { user: meView(state, user) });
}

// First-run: claim the admin account from the UI when none exists yet. This is
// the one bootstrap that's allowed in open mode; afterwards login is required.
export async function setupAdmin(req: IncomingMessage, res: ServerResponse, state: RuntimeState) {
  if (!state.identity) return writeJson(res, 400, { error: "identity_unavailable" });
  if (state.bootstrapSetup) {
    await state.bootstrapSetup;
    return writeJson(res, 403, { error: "already_initialized" });
  }
  if (authRequired(state)) return writeJson(res, 403, { error: "already_initialized" });
  let release = () => {};
  state.bootstrapSetup = new Promise<void>((resolve) => { release = resolve; });
  try {
  const setupAttempt = attemptKey("setup", req, "");
  if (rateLimited(state, setupAttempt)) return writeJson(res, 429, { error: "too_many_attempts" });
  const body = await readJson(req);
  const id = typeof body.username === "string" ? body.username.trim() : "";
  if (!isValidUserId(id)) return writeJson(res, 400, { error: "invalid_user_id" });
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    recordFailure(state, setupAttempt);
    return writeJson(res, 400, { error: "weak_password" });
  }
  if (passwordTooLong(password)) return writeJson(res, 400, { error: "password_too_long" });
  const createdEveryone = !state.identity.getTeam("everyone");
  if (createdEveryone) await state.identity.putTeam({ id: "everyone", name: "Everyone", allowedProviders: "*", managerIds: [], createdAt: new Date().toISOString() });
  const user: User = { id, displayName: typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : id, role: "admin", password: await hashPasswordAsync(password), teamIds: ["everyone"], sessionVersion: 0, createdAt: new Date().toISOString() };
  await state.identity.putUser(user);
  if (createdEveryone) await state.identity.putTeam({ ...state.identity.getTeam("everyone")!, managerIds: [id] });
  clearFailures(state, setupAttempt);
  const token = signSession(user.id, state.sessionSecret, undefined, undefined, user.sessionVersion ?? 0);
  res.writeHead(200, authHeaders(req, `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`));
  res.end(JSON.stringify({ ok: true, user: meView(state, user) }));
  } finally {
    release();
    state.bootstrapSetup = undefined;
  }
}

function attemptKey(kind: string, req: IncomingMessage, userId: string): string {
  return `${kind}:${clientAddress(req)}:${userId.trim().toLowerCase()}`;
}

function clientAddress(req: IncomingMessage): string {
  return (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "").toLowerCase();
}

function rateLimited(state: RuntimeState, key: string): boolean {
  const entry = state.authAttempts[key];
  if (!entry || entry.resetAt <= Date.now()) return false;
  return entry.count >= MAX_AUTH_FAILURES;
}

function recordFailure(state: RuntimeState, key: string): void {
  const now = Date.now();
  const current = state.authAttempts[key];
  state.authAttempts[key] = current && current.resetAt > now ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: now + AUTH_WINDOW_MS };
}

function clearFailures(state: RuntimeState, key: string): void {
  delete state.authAttempts[key];
}

function meView(state: RuntimeState, user: User) {
  return { id: user.id, displayName: user.displayName, role: user.role, teamIds: user.teamIds, keyPermissions: user.keyPermissions, canManage: canManage(state, user) };
}

function authHeaders(req: IncomingMessage, cookie: string): Record<string, string> {
  return jsonHeaders({ "set-cookie": secureCookie(req, cookie) });
}

function secureCookie(_req: IncomingMessage, cookie: string): string {
  return process.env.MOLENKOPF_EXTERNAL_SCHEME === "https" ? `${cookie}; Secure` : cookie;
}
