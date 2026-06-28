import { validateProviderTarget } from "../security/target-policy.ts";

export type ProviderKind = "api" | "local" | "cli";

export const DEFAULT_CLI_PROVIDER_TIMEOUT_MS = 600000;

export type RuntimeProfileConfig = {
  settingsRef?: string;
  configRef?: string;
  permissionMode?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  addDirs?: string[];
  sandbox?: string;
  approval?: string;
  summary?: string[];
};

export type RuntimeProfileDiagnostics = {
  settingsSource?: string;
  configSource?: string;
  permissionMode?: string;
  sandbox?: string;
  approval?: string;
  allowedToolCount: number;
  deniedToolCount: number;
  addDirCount: number;
  outerHarness: "unknown";
  remediation: string;
};

export type RuntimeProfileView = { summary: string[]; diagnostics?: RuntimeProfileDiagnostics };

export type ProviderConfig = {
  id: string;
  name: string;
  kind: ProviderKind;
  target: string;
  credentialEnv?: string;
  credentialRef?: string;
  credentialValue?: string;
  authScheme?: "bearer" | "x-api-key" | "none";
  runtime?: "claude" | "codex";
  cliCommand?: string;
  cliArgs?: string[];
  cliInputMode?: "stdin" | "argument";
  cliTimeoutMs?: number;
  runtimeAuthDir?: string;
  authRef?: string;
  runtimeProfile?: RuntimeProfileConfig;
  protocol?: "openai-responses" | "anthropic-messages" | "openai-chat" | "ollama-tags";
  allowDistribution?: boolean;
  allowClientCredentialForwarding?: boolean;
  enabled?: boolean;
};

export type ProviderView = Omit<ProviderConfig, "credentialValue" | "runtimeAuthDir" | "authRef" | "runtimeProfile" | "cliArgs"> & {
  active: boolean;
  credentialConfigured: boolean;
  runtimeAuthConfigured: boolean;
  runtimeProfile?: RuntimeProfileView;
  selectable: boolean;
};

export type ProviderCatalogOptions = { includeBuiltIns?: boolean; includeEnvProviders?: boolean };

export function buildProviderCatalog(target: string, extra: ProviderConfig[] = [], env: Record<string, string | undefined> = process.env, options: ProviderCatalogOptions = {}): ProviderConfig[] {
  const includeBuiltIns = options.includeBuiltIns !== false;
  const includeEnvProviders = options.includeEnvProviders !== false;
  const providers: ProviderConfig[] = [
    ...(includeBuiltIns ? builtInProviders(target, env) : []),
    ...(includeEnvProviders ? configuredEnvProviders(env) : []),
    ...extra.map((item) => ({ ...item, enabled: item.enabled !== false }))
  ];
  return uniqueById(providers);
}

export function viewProviders(providers: ProviderConfig[], activeProviderId: string, env: Record<string, string | undefined> = process.env): ProviderView[] {
  return providers.map((provider) => {
    const { credentialValue, runtimeAuthDir, authRef, runtimeProfile, cliArgs, ...safeProvider } = provider;
    return {
      ...safeProvider,
      active: provider.id === activeProviderId,
      credentialConfigured: Boolean(credentialValue || (provider.credentialEnv && env[provider.credentialEnv])),
      runtimeAuthConfigured: Boolean(runtimeAuthDir),
      runtimeProfile: viewRuntimeProfile(runtimeProfile),
      selectable: provider.enabled !== false
    };
  });
}

export function viewRuntimeProfile(profile: RuntimeProfileConfig | undefined): RuntimeProfileView | undefined {
  const summary = profile?.summary?.map((item) => item.slice(0, 80)).filter(Boolean) ?? [];
  if (!summary.length) return undefined;
  return { summary, diagnostics: runtimeDiagnostics(profile) };
}

function runtimeDiagnostics(profile: RuntimeProfileConfig | undefined): RuntimeProfileDiagnostics | undefined {
  if (!profile) return undefined;
  return {
    settingsSource: profile.settingsRef,
    configSource: profile.configRef,
    permissionMode: profile.permissionMode,
    sandbox: profile.sandbox,
    approval: profile.approval,
    allowedToolCount: profile.allowedTools?.length ?? 0,
    deniedToolCount: profile.disallowedTools?.length ?? 0,
    addDirCount: profile.addDirs?.length ?? 0,
    outerHarness: "unknown",
    remediation: "If the host client still asks, approve that prompt or configure this project in .claude/settings.json; Molenkopf cannot bypass a separate Claude/Codex harness."
  };
}

function builtInProviders(target: string, env: Record<string, string | undefined>): ProviderConfig[] {
  const openaiTarget = safeTarget(env.OPENAI_BASE_URL, "https://api.openai.com/v1");
  const anthropicTarget = safeTarget(env.ANTHROPIC_BASE_URL, "https://api.anthropic.com/v1");
  const ollamaTarget = safeTarget(env.OLLAMA_BASE_URL, "http://127.0.0.1:11434/v1", true);
  const lmstudioTarget = safeTarget(env.LMSTUDIO_BASE_URL, "http://127.0.0.1:1234/v1", true);
  return [
    { id: "default", name: "Default upstream", kind: "api", target, authScheme: "none", enabled: true },
    { id: "openai-env", name: "OpenAI env profile", kind: "api", target: openaiTarget.value, credentialEnv: "OPENAI_API_KEY", credentialRef: "env:OPENAI_API_KEY", authScheme: "bearer", protocol: "openai-responses", enabled: openaiTarget.safe && Boolean(env.OPENAI_BASE_URL || env.OPENAI_API_KEY) },
    { id: "anthropic-env", name: "Anthropic env profile", kind: "api", target: anthropicTarget.value, credentialEnv: "ANTHROPIC_API_KEY", credentialRef: "env:ANTHROPIC_API_KEY", authScheme: "x-api-key", protocol: "anthropic-messages", enabled: anthropicTarget.safe && Boolean(env.ANTHROPIC_BASE_URL || env.ANTHROPIC_API_KEY) },
    { id: "ollama-local", name: "Local Ollama compatible", kind: "local", target: ollamaTarget.value, authScheme: "none", protocol: "ollama-tags", enabled: ollamaTarget.safe && Boolean(env.OLLAMA_BASE_URL) },
    { id: "lmstudio-local", name: "Local LM Studio compatible", kind: "local", target: lmstudioTarget.value, authScheme: "none", protocol: "openai-chat", enabled: lmstudioTarget.safe && Boolean(env.LMSTUDIO_BASE_URL) }
  ];
}

function configuredEnvProviders(env: Record<string, string | undefined>): ProviderConfig[] {
  return splitCsv(env.MOLENKOPF_PROVIDER_IDS).map((id) => providerFromEnv(id, env)).filter((item): item is ProviderConfig => Boolean(item));
}

function providerFromEnv(id: string, env: Record<string, string | undefined>): ProviderConfig | undefined {
  if (!/^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(id)) return undefined;
  const prefix = `MOLENKOPF_PROVIDER_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
  const kind = env[`${prefix}KIND`] === "local" ? "local" : "api";
  const checkedTarget = safeTarget(env[`${prefix}TARGET`], "", kind === "local");
  const target = checkedTarget.value;
  if (!target || !checkedTarget.safe) return undefined;
  const credentialEnv = env[`${prefix}CREDENTIAL_ENV`]?.trim();
  return {
    id,
    name: env[`${prefix}NAME`]?.trim() || id,
    kind,
    target,
    credentialEnv: credentialEnv || undefined,
    credentialRef: credentialEnv ? `env:${credentialEnv}` : "none",
    authScheme: authScheme(env[`${prefix}AUTH`], target, credentialEnv),
    protocol: protocol(env[`${prefix}PROTOCOL`], kind, target),
    enabled: env[`${prefix}ENABLED`]?.toLowerCase() !== "false"
  };
}

function safeTarget(value: string | undefined, fallback = "", allowPrivate = false): { value: string; safe: boolean } {
  const candidate = value?.trim() || fallback;
  if (!candidate) return { value: "", safe: false };
  try {
    validateProviderTarget(candidate, { allowPrivate });
    return { value: candidate, safe: true };
  } catch {
    return { value: fallback, safe: false };
  }
}

function authScheme(value: string | undefined, target: string, credentialEnv?: string): ProviderConfig["authScheme"] {
  if (value === "bearer" || value === "x-api-key" || value === "none") return value;
  if (!credentialEnv) return "none";
  return target.includes("anthropic") ? "x-api-key" : "bearer";
}

function protocol(value: string | undefined, kind: ProviderKind, target: string): ProviderConfig["protocol"] {
  if (value === "openai-responses" || value === "anthropic-messages" || value === "openai-chat" || value === "ollama-tags") return value;
  if (kind === "local" && target.includes("11434")) return "ollama-tags";
  if (kind === "local") return "openai-chat";
  return target.includes("anthropic") ? "anthropic-messages" : "openai-responses";
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueById(providers: ProviderConfig[]): ProviderConfig[] {
  const seen = new Set<string>();
  return providers.filter((provider) => {
    if (seen.has(provider.id)) return false;
    seen.add(provider.id);
    return true;
  });
}
