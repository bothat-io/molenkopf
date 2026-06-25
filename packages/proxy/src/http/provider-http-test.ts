import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { resolveConnectTarget } from "../../../core/src/security/target-policy.ts";
import { buildForwardHeaders, missingProviderCredential } from "./header-utils.ts";

type Check = { status: "ok" | "failed" | "missing" | "unknown" | "blocked"; message: string };
type SmokeSpec = { method: "GET" | "POST"; path: string; protocol: string; body?: Record<string, unknown> };

export async function providerHttpTest(provider: ProviderConfig) {
  const base = {
    providerId: provider.id,
    kind: provider.kind,
    runtime: provider.runtime ?? provider.kind,
    protocol: protocolOf(provider),
    auth: authCheck(provider),
    model: { status: "unknown", message: "Not tested yet" } as Check,
    permission: { status: "unknown", message: "HTTP providers do not use host CLI permissions" } as Check,
    http: { statusCode: 0, path: "", method: "" }
  };
  if (base.auth.status === "missing") return base;
  const spec = smokeSpec(provider);
  const headers = buildForwardHeaders(new Headers({ "content-type": "application/json" }), provider);
  if (spec.protocol === "anthropic-messages") headers.set("anthropic-version", "2023-06-01");
  const url = smokeUrl(provider.target, spec);
  try {
    await resolveConnectTarget(url, { path: "provider test target", allowPrivate: provider.kind === "local" });
    const response = await fetch(url, {
      method: spec.method,
      headers,
      body: spec.body ? JSON.stringify(spec.body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
    const redirect = await blockedRedirect(response, url, provider.kind === "local");
    if (redirect) return { ...base, model: redirect, http: { statusCode: response.status, path: spec.path, method: spec.method } };
    await response.arrayBuffer().catch(() => undefined);
    return {
      ...base,
      auth: authFromStatus(response.status, base.auth),
      model: statusCheck(response.status, spec),
      http: { statusCode: response.status, path: spec.path, method: spec.method }
    };
  } catch (error) {
    return { ...base, model: { status: "failed", message: safeError(error) } as Check, http: { statusCode: 0, path: spec.path, method: spec.method } };
  }
}

async function blockedRedirect(response: Response, url: string, allowPrivate: boolean): Promise<Check | undefined> {
  if (response.status < 300 || response.status > 399) return undefined;
  const location = response.headers.get("location");
  if (!location) return undefined;
  try { await resolveConnectTarget(new URL(location, url).toString(), { path: "provider redirect", allowPrivate }); return undefined; }
  catch { return { status: "blocked", message: "Provider redirect target is not allowed" }; }
}

function authCheck(provider: ProviderConfig): Check {
  if (missingProviderCredential(provider)) return { status: "missing", message: "Provider credential is missing" };
  return { status: "ok", message: provider.authScheme === "none" ? "No credential required" : "Provider credential policy is configured" };
}

function authFromStatus(status: number, current: Check): Check {
  if (status === 401 || status === 403) return { status: "failed", message: `Upstream rejected credentials with HTTP ${status}` };
  return current;
}

function statusCheck(status: number, spec: SmokeSpec): Check {
  const message = `${spec.protocol} smoke ${spec.method} ${spec.path} returned HTTP ${status}`;
  return status >= 200 && status < 300 ? { status: "ok", message } : { status: "failed", message };
}

function smokeSpec(provider: ProviderConfig): SmokeSpec {
  const protocol = protocolOf(provider);
  if (protocol === "ollama-tags") return { method: "GET", path: "/api/tags", protocol };
  if (protocol === "anthropic-messages") return {
    method: "POST", path: "/messages", protocol,
    body: { model: "claude-3-5-haiku-latest", max_tokens: 1, messages: [{ role: "user", content: "Reply OK" }] }
  };
  if (protocol === "openai-chat") return { method: "GET", path: "/models", protocol };
  return { method: "POST", path: "/responses", protocol, body: { model: "gpt-4.1-mini", input: "Reply OK", max_output_tokens: 1 } };
}

function protocolOf(provider: ProviderConfig): NonNullable<ProviderConfig["protocol"]> {
  if (provider.protocol) return provider.protocol;
  if (provider.kind === "local" && provider.target.includes("11434")) return "ollama-tags";
  if (provider.kind === "local") return "openai-chat";
  return provider.authScheme === "x-api-key" || provider.target.includes("anthropic") ? "anthropic-messages" : "openai-responses";
}

function smokeUrl(target: string, spec: SmokeSpec): string {
  if (spec.protocol === "ollama-tags") return new URL(spec.path, new URL(target).origin).toString();
  const base = target.endsWith("/") ? target : `${target}/`;
  return new URL(spec.path.replace(/^\//, ""), base).toString();
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
}
