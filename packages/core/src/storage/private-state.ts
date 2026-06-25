import { chmod, mkdir, writeFile } from "node:fs/promises";
import { chmodSync, mkdirSync } from "node:fs";

export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

export async function ensurePrivateDir(path: string): Promise<void> {
  await mkdir(path, process.platform === "win32" ? { recursive: true } : { recursive: true, mode: PRIVATE_DIR_MODE });
  await chmodPrivate(path, PRIVATE_DIR_MODE);
}

export function ensurePrivateDirSync(path: string): void {
  mkdirSync(path, process.platform === "win32" ? { recursive: true } : { recursive: true, mode: PRIVATE_DIR_MODE });
  chmodPrivateSync(path, PRIVATE_DIR_MODE);
}

export async function writePrivateFile(path: string, data: string | Buffer): Promise<void> {
  await writeFile(path, data, process.platform === "win32" ? undefined : { mode: PRIVATE_FILE_MODE });
  await chmodPrivate(path, PRIVATE_FILE_MODE);
}

export async function chmodPrivate(path: string, mode: number): Promise<void> {
  if (process.platform === "win32") return;
  try { await chmod(path, mode); } catch { /* best effort for non-POSIX filesystems */ }
}

export function chmodPrivateSync(path: string, mode: number): void {
  if (process.platform === "win32") return;
  try { chmodSync(path, mode); } catch { /* best effort for non-POSIX filesystems */ }
}
