import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";

export function buildProviderFromInput(id: string, name: string, body: Record<string, unknown>): { provider: ProviderConfig } | { error: string } {
  const kind = String(body.kind ?? "openai");
  if (!knownKind(kind)) return { error: "invalid_kind" };
  const credential = typeof body.credential === "string" && body.credential.trim() ? body.credential.trim() : undefined;
  const credentialEnv = typeof body.credentialEnv === "string" && body.credentialEnv.trim() ? body.credentialEnv.trim() : undefined;
  if (credentialEnv && !validEnv(credentialEnv)) return { error: "invalid_credential_env" };
  if (kind === "cli-claude" || kind === "cli-codex") {
    const runtime = kind === "cli-codex" ? "codex" : "claude";
    return { provider: { id, name, kind: "cli", target: `cli://${id}`, runtime, cliCommand: runtime, cliArgs: runtime === "codex" ? ["exec"] : ["--print"], cliInputMode: "stdin", authScheme: "none", credentialRef: "none", enabled: true } };
  }
  const target = providerTarget(kind, body);
  const providerKind = kind === "local" || kind === "ollama" ? "local" : "api";
  try { validateProviderTarget(target, { path: "provider target", allowPrivate: providerKind === "local" }); } catch { return { error: "invalid_target" }; }
  const authScheme = kind === "anthropic" ? "x-api-key" : providerKind === "local" ? "none" : credential || credentialEnv ? "bearer" : "none";
  return { provider: { id, name, kind: providerKind, target, authScheme, protocol: providerProtocol(kind), credentialValue: credential, credentialEnv, credentialRef: credential ? "inline" : credentialEnv ? `env:${credentialEnv}` : "none", enabled: true } };
}

export function validEnv(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/i.test(value);
}

function providerTarget(kind: string, body: Record<string, unknown>): string {
  const target = typeof body.target === "string" ? body.target.trim() : "";
  return target || (kind === "ollama" ? "http://127.0.0.1:11434/v1" : "");
}

function providerProtocol(kind: string): ProviderConfig["protocol"] {
  if (kind === "anthropic") return "anthropic-messages";
  if (kind === "ollama") return "ollama-tags";
  if (kind === "local") return "openai-chat";
  return "openai-responses";
}

function knownKind(kind: string): boolean {
  return ["openai", "openai-compatible", "anthropic", "local", "ollama", "cli-claude", "cli-codex"].includes(kind);
}
