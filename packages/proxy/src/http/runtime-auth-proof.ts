import { createHash, randomBytes } from "node:crypto";
import type { RuntimeState } from "./runtime-state.ts";

type Proof = { digest: string; expiresAt: number };

const PROOF_TTL_MS = 5 * 60 * 1000;
const PROOF_FIELDS = ["id", "name", "runtime", "authJson", "profileText", "settingsJson", "configToml", "profile", "activate"] as const;

export function issueRuntimeAuthProof(state: RuntimeState, body: Record<string, unknown>, now = Date.now()): string {
  clearExpiredProofs(state, now);
  const token = randomBytes(24).toString("base64url");
  state.runtimeAuthProofs[token] = { digest: runtimeAuthDigest(body), expiresAt: now + PROOF_TTL_MS };
  return token;
}

export function consumeRuntimeAuthProof(state: RuntimeState, body: Record<string, unknown>, now = Date.now()): boolean {
  const token = typeof body.importProof === "string" ? body.importProof : "";
  const proof = token ? state.runtimeAuthProofs[token] : undefined;
  if (token) delete state.runtimeAuthProofs[token];
  clearExpiredProofs(state, now);
  return Boolean(proof && proof.expiresAt > now && proof.digest === runtimeAuthDigest(body));
}

export function runtimeAuthDigest(body: Record<string, unknown>): string {
  const payload: Record<string, unknown> = {};
  for (const field of PROOF_FIELDS) if (body[field] !== undefined) payload[field] = normalize(body[field]);
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function clearExpiredProofs(state: RuntimeState, now: number): void {
  for (const [token, proof] of Object.entries(state.runtimeAuthProofs)) {
    if (proof.expiresAt <= now) delete state.runtimeAuthProofs[token];
  }
}

function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type RuntimeAuthProofStore = Record<string, Proof>;
