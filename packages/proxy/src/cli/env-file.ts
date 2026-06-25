import { readFile } from "node:fs/promises";

export async function loadEnvFile(file: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  Object.assign(env, parseEnvFile(await readFile(file, "utf8")));
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

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
