import { createHash } from "node:crypto";
import type { ProviderAllowlist } from "./provider-access.ts";

export type ClientIdentity = {
  id: string;
  label: string;
  source: "user" | "agent" | "api_key" | "unattributed";
  userId?: string;
  agentId?: string;
  keyAgentLabel?: string;
  teamIds?: string[];
  keyId?: string;
  project?: string;
  allowedProviderIds?: ProviderAllowlist;
};

export function deriveClientIdentity(headers: Headers): ClientIdentity {
  const agent = agentIdFromHeaders(headers);
  if (agent) return { id: clientIdForAgent(agent), label: `agent:${safeSubjectId(agent)}`, source: "agent", agentId: agent };
  const credential = headers.get("authorization") || headers.get("x-api-key");
  if (credential) {
    const hash = createHash("sha256").update(credential).digest("hex").slice(0, 12);
    return { id: `api-key:${hash}`, label: `api-key sha256:${hash}`, source: "api_key" };
  }
  return { id: "unattributed", label: "unattributed client", source: "unattributed" };
}

export function clientIdForAgent(agentId: string): string {
  return `agent:${safeSubjectId(agentId)}`;
}

export function agentIdFromHeaders(headers: Headers): string | undefined {
  return clean(headers.get("x-molenkopf-agent"));
}

function clean(value: string | null): string | undefined {
  const normalized = value?.replace(/[^\w .@-]/g, "").trim().slice(0, 48);
  return normalized || undefined;
}

export function safeSubjectId(value: string): string {
  return looksSensitive(value) ? createHash("sha256").update(value).digest("hex").slice(0, 12) : slug(value);
}

function looksSensitive(value: string): boolean {
  return /@|\s/.test(value);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unknown";
}
