import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseMolenkopfConfigJson, type NormalizedMolenkopfConfig } from "../../../core/src/config/molenkopf-config.ts";

export type LoadedProxyConfig = {
  source: "env" | "file";
  configPath?: string;
  config?: NormalizedMolenkopfConfig;
};

const DEFAULT_CONFIG_FILES = ["molenkopf.config.json", ".molenkopf/config.json"];

export async function loadProxyConfig(flags: Map<string, string | boolean>, env: Record<string, string | undefined> = process.env, cwd = process.cwd()): Promise<LoadedProxyConfig> {
  const configPath = await resolveConfigPath(flags, env, cwd);
  if (!configPath) return { source: "env" };
  const text = await readFile(configPath, "utf8");
  return { source: "file", configPath, config: parseMolenkopfConfigJson(text, configPath) };
}

export async function resolveConfigPath(flags: Map<string, string | boolean>, env: Record<string, string | undefined> = process.env, cwd = process.cwd()): Promise<string | undefined> {
  const explicit = stringFlag(flags, "config") ?? env.MOLENKOPF_CONFIG_FILE;
  if (explicit) return requireFile(resolve(cwd, explicit), true);
  for (const name of DEFAULT_CONFIG_FILES) {
    const found = await requireFile(resolve(cwd, name), false);
    if (found) return found;
  }
  return undefined;
}

function stringFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function requireFile(path: string, explicit: boolean): Promise<string | undefined> {
  try {
    await access(path);
    return path;
  } catch {
    if (explicit) throw new Error(`Molenkopf config file not found: ${path}`);
    return undefined;
  }
}
