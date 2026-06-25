import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Password hashing with scrypt (Node built-in). We store salt + hash only, never
// the raw password. Used for admin/user login.

const scryptAsync = promisify(scrypt);
export const MAX_PASSWORD_BYTES = 4096;
export type PasswordHash = { salt: string; hash: string; version?: 1; keyLength?: number };

export function hashPassword(password: string): PasswordHash {
  assertPasswordSize(password);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash, version: 1, keyLength: 64 };
}

export async function hashPasswordAsync(password: string): Promise<PasswordHash> {
  assertPasswordSize(password);
  const salt = randomBytes(16).toString("hex");
  const keyLength = 64;
  const hash = (await scryptAsync(password, salt, keyLength) as Buffer).toString("hex");
  return { salt, hash, version: 1, keyLength };
}

export function verifyPassword(password: string, stored: PasswordHash | undefined): boolean {
  if (!stored?.salt || !stored.hash) return false;
  if (passwordTooLong(password)) return false;
  const candidate = scryptSync(password, stored.salt, stored.keyLength ?? 64);
  const expected = Buffer.from(stored.hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function verifyPasswordAsync(password: string, stored: PasswordHash | undefined): Promise<boolean> {
  if (!stored?.salt || !stored.hash || passwordTooLong(password)) return false;
  const candidate = await scryptAsync(password, stored.salt, stored.keyLength ?? 64) as Buffer;
  const expected = Buffer.from(stored.hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function passwordTooLong(password: string): boolean {
  return Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES;
}

function assertPasswordSize(password: string): void {
  if (passwordTooLong(password)) throw new Error("password_too_long");
}
