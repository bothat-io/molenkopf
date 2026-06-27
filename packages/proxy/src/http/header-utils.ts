import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";

const hopByHop = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host"]);
const sensitive = new Set(["authorization", "cookie", "set-cookie", "x-api-key"]);
const providerAuth = new Set(["authorization", "x-api-key"]);
const blockedRequest = new Set(["set-cookie", "forwarded", "proxy-connection", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"]);

export function buildForwardHeaders(headers: Headers, provider?: ProviderConfig, env: Record<string, string | undefined> = process.env): Headers {
  const out = new Headers();
  const usesProviderCredential = hasProviderCredentialRef(provider);
  const forwardsClientCredential = forwardsClientAuth(provider);
  const credential = usesProviderCredential ? providerCredential(provider, env) : undefined;
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (blockedRequest.has(lower)) return;
    if (hopByHop.has(lower) || lower.startsWith("x-molenkopf-")) return;
    if (lower === "cookie") return;
    if (providerAuth.has(lower) && usesProviderCredential) return;
    if (providerAuth.has(lower) && stripsClientAuth(provider) && !provider?.allowClientCredentialForwarding) return;
    if (providerAuth.has(lower) && !forwardsClientCredential) return;
    out.set(key, value);
  });
  if (credential) setProviderCredential(out, provider?.authScheme, credential);
  return out;
}

export function missingProviderCredential(provider: ProviderConfig | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(hasProviderCredentialRef(provider) && provider?.authScheme !== "none" && !providerCredential(provider, env));
}

function hasProviderCredentialRef(provider: ProviderConfig | undefined): boolean {
  if (!provider) return false;
  if (provider.credentialValue) return true;
  if (provider.credentialEnv) return true;
  return Boolean(provider.credentialRef && provider.credentialRef !== "none");
}

function stripsClientAuth(provider: ProviderConfig | undefined): boolean {
  if (!provider || provider.id === "default") return false;
  return provider.authScheme === "none" || provider.kind === "local";
}

function forwardsClientAuth(provider: ProviderConfig | undefined): boolean {
  if (!provider) return false;
  if (provider.allowClientCredentialForwarding) return true;
  return provider.id === "default" && provider.kind === "api" && provider.authScheme === "none" && !hasProviderCredentialRef(provider);
}

function providerCredential(provider: ProviderConfig | undefined, env: Record<string, string | undefined>): string | undefined {
  return provider?.credentialValue ?? (provider?.credentialEnv ? env[provider.credentialEnv] : undefined);
}

function setProviderCredential(headers: Headers, scheme: ProviderConfig["authScheme"], credential: string) {
  if (scheme === "none") return;
  if (scheme === "x-api-key") headers.set("x-api-key", credential);
  else headers.set("authorization", credential.toLowerCase().startsWith("bearer ") ? credential : `Bearer ${credential}`);
}

export function sanitizeHeadersForAudit(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!sensitive.has(key.toLowerCase())) out[key] = value;
  });
  return out;
}
