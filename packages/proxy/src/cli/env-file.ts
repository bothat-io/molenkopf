import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type LoadOptions = { overwrite?: boolean };

export async function loadEnvFile(file: string, env: Record<string, string | undefined> = process.env, options: LoadOptions = {}): Promise<void> {
  applyEnv(parseEnvFile(await readFile(file, "utf8")), env, options);
}

export function loadDefaultEnvFile(cwd = process.cwd(), env: Record<string, string | undefined> = process.env): boolean {
  const file = join(cwd, ".env");
  if (!existsSync(file)) return false;
  applyEnv(parseEnvFile(readFileSync(file, "utf8")), env, { overwrite: false });
  return true;
}

export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    result[key] = unquote(line.slice(index + 1).trim());
  }
  return result;
}

function applyEnv(values: Record<string, string>, env: Record<string, string | undefined>, options: LoadOptions): void {
  for (const [key, value] of Object.entries(values)) {
    if (options.overwrite === true || env[key] === undefined) env[key] = value;
  }
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
