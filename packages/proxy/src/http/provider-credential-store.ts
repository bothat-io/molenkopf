import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { defaultDataDir } from "../../../core/src/storage/local-paths.ts";
import { ensurePrivateDir, writePrivateFile } from "../../../core/src/storage/private-state.ts";

export const LOCAL_PROVIDER_REF_PREFIX = "local-provider:";

export function attachLocalProviderCredentials(dataDir: string | undefined, providers: ProviderConfig[]): void {
  for (const provider of providers) {
    if (!isLocalProviderCredentialRef(provider.credentialRef, provider.id)) continue;
    const credential = readCredential(dataDir, provider.id);
    if (credential) provider.credentialValue = credential;
  }
}

export async function storeLocalProviderCredential(dataDir: string | undefined, provider: ProviderConfig, credential: string): Promise<void> {
  const value = credential.trim();
  if (!value) return;
  await ensurePrivateDir(root(dataDir));
  await writePrivateFile(credentialPath(dataDir, provider.id), value);
  provider.credentialValue = value;
  provider.credentialEnv = undefined;
  provider.credentialRef = localProviderCredentialRef(provider.id);
}

export async function removeLocalProviderCredential(dataDir: string | undefined, id: string): Promise<void> {
  await rm(credentialPath(dataDir, id), { force: true });
}

export function localProviderCredentialRef(id: string): string {
  return `${LOCAL_PROVIDER_REF_PREFIX}${id}`;
}

export function isLocalProviderCredentialRef(value: unknown, id?: string): value is string {
  return typeof value === "string" && value === localProviderCredentialRef(id ?? value.slice(LOCAL_PROVIDER_REF_PREFIX.length));
}

function readCredential(dataDir: string | undefined, id: string): string | undefined {
  try {
    const value = readFileSync(credentialPath(dataDir, id), "utf8").trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function credentialPath(dataDir: string | undefined, id: string): string {
  return join(root(dataDir), `${createHash("sha256").update(id).digest("hex").slice(0, 16)}.token`);
}

function root(dataDir: string | undefined): string {
  return join(dataDir ?? defaultDataDir(), "provider-credentials");
}
