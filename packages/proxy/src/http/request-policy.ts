import { agentIdFromHeaders, type ClientIdentity } from "./client-identity.ts";
import type { RuntimeState } from "./runtime-state.ts";

export type EffectiveRequestPolicy = {
  agentId?: string;
  allowedModels?: string[];
  defaultModel?: string;
};

export type ModelPolicyResult = { ok: true } | { ok: false; status: number; error: string };

export function effectiveRequestPolicy(state: RuntimeState, headers: Headers, client: ClientIdentity): EffectiveRequestPolicy {
  const agentId = agentIdFromHeaders(headers);
  if (!agentId || client.source !== "api_key" || client.keyAgentLabel !== agentId) return {};
  const configAgent = state.configAgents.find((item) => item.id === agentId);
  const draft = state.agentDrafts.find((item) => item.id === agentId);
  return {
    agentId,
    allowedModels: configAgent?.allowedModels,
    defaultModel: configAgent?.defaultModel
  };
}

export function enforceModelPolicy(policy: EffectiveRequestPolicy, body: string): ModelPolicyResult {
  if (!policy.allowedModels?.length) return { ok: true };
  const model = modelFromBody(body);
  if (model === false) return { ok: false, status: 400, error: "invalid_json" };
  if (model === undefined) return { ok: true };
  if (!policy.allowedModels.includes(model)) return { ok: false, status: 403, error: "model_forbidden" };
  return { ok: true };
}

function modelFromBody(body: string): string | undefined | false {
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    return typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : undefined;
  } catch {
    return false;
  }
}
