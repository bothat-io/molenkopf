import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";

const PRESERVED_ENV = new Set([
  "APPDATA", "COMSPEC", "HOME", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL", "LC_CTYPE",
  "LOCALAPPDATA", "LOGNAME", "NUMBER_OF_PROCESSORS", "OS", "PATH", "PATHEXT", "PROGRAMDATA",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "PROCESSOR_ARCHITECTURE", "SHELL",
  "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TERM", "TMP", "TMPDIR", "USER", "USERDOMAIN",
  "USERNAME", "USERPROFILE", "WINDIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME"
]);

export function cliEnv(provider: ProviderConfig, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && PRESERVED_ENV.has(key.toUpperCase())) env[key] = value;
  }
  if (provider.runtimeAuthDir && provider.runtime === "codex") env.CODEX_HOME = provider.runtimeAuthDir;
  if (provider.runtimeAuthDir && provider.runtime === "claude") {
    env.CLAUDE_CONFIG_DIR = provider.runtimeAuthDir;
    env.CLAUDE_HOME = provider.runtimeAuthDir;
  }
  return env;
}
