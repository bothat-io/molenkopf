import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { inferredCredentialAuthScheme } from "../../../core/src/providers/provider-auth.ts";
import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";
import { hasCredential, originOf } from "./provider-action-helpers.ts";
import { validEnv } from "./provider-input.ts";

type ProviderUpdate = { ok: true; provider: ProviderConfig; nextCredential?: string } | { ok: false; status: number; error: string };

export function prepareProviderUpdate(current: ProviderConfig, body: Record<string, unknown>): ProviderUpdate {
  const provider = { ...current, cliArgs: current.cliArgs ? [...current.cliArgs] : undefined };
  if (typeof body.name === "string" && body.name.trim()) provider.name = body.name.trim().slice(0, 80);
  if (typeof body.target === "string" && body.target.trim()) {
    const target = cleanTarget(provider, body.target);
    if (target.ok === false) return target;
    if (originOf(target.value) !== originOf(provider.target)) {
      if (hasCredential(provider) && body.clearCredential !== true && body.credential === undefined && body.credentialEnv === undefined) {
        return { ok: false, status: 409, error: "credential_origin_change" };
      }
      clearCredential(provider);
    }
    provider.target = target.value;
  }
  if (typeof body.credentialEnv === "string") {
    const env = body.credentialEnv.trim();
    if (env && !validEnv(env)) return { ok: false, status: 400, error: "invalid_credential_env" };
    provider.credentialEnv = env || undefined;
    provider.credentialValue = undefined;
    provider.credentialRef = provider.credentialEnv ? `env:${provider.credentialEnv}` : "none";
    provider.authScheme = provider.credentialEnv ? credentialAuthScheme(provider) : "none";
  }
  const nextCredential = typeof body.credential === "string" && body.credential.trim() ? body.credential.trim() : undefined;
  if (nextCredential) {
    provider.credentialValue = nextCredential;
    provider.credentialEnv = undefined;
    provider.credentialRef = "inline";
    provider.authScheme = credentialAuthScheme(provider);
  }
  if (body.clearCredential === true) clearCredential(provider);
  if (typeof body.enabled === "boolean") provider.enabled = body.enabled;
  if (typeof body.allowDistribution === "boolean") provider.allowDistribution = body.allowDistribution;
  return { ok: true, provider, nextCredential: body.clearCredential === true ? undefined : nextCredential };
}

function cleanTarget(provider: ProviderConfig, value: string): { ok: true; value: string } | { ok: false; status: number; error: string } {
  try {
    return { ok: true, value: validateProviderTarget(value.trim(), { path: "provider target", allowPrivate: provider.kind === "local" }) };
  } catch {
    return { ok: false, status: 400, error: "invalid_target" };
  }
}

function clearCredential(provider: ProviderConfig): void {
  provider.credentialValue = undefined;
  provider.credentialEnv = undefined;
  provider.credentialRef = "none";
  provider.authScheme = "none";
}

function credentialAuthScheme(provider: ProviderConfig): ProviderConfig["authScheme"] {
  if (provider.kind === "local") return "none";
  return inferredCredentialAuthScheme(true, { protocol: provider.protocol, target: provider.target });
}
