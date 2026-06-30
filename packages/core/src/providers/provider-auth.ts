import type { ProviderConfig } from "./provider-catalog.ts";

export type ProviderAuthInference = {
  protocol?: ProviderConfig["protocol"];
  kind?: unknown;
  target?: string;
};

export function inferredCredentialAuthScheme(credentialConfigured: unknown, input: ProviderAuthInference): ProviderConfig["authScheme"] {
  if (!credentialConfigured) return "none";
  return isAnthropicStyleProvider(input) ? "x-api-key" : "bearer";
}

export function isAnthropicStyleProvider(input: ProviderAuthInference): boolean {
  if (input.protocol === "anthropic-messages" || input.kind === "anthropic") return true;
  const host = normalizedHost(input.target);
  return Boolean(host && host.includes("anthropic"));
}

function normalizedHost(target: string | undefined): string {
  if (!target) return "";
  try { return new URL(target).hostname.toLowerCase(); } catch { return ""; }
}
