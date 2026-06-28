import { agentIdFromHeaders, type ClientIdentity } from "./client-identity.ts";
import type { RuntimeState } from "./runtime-types.ts";

export type EffectiveRequestPolicy = {
  agentId?: string;
  allowedModels?: string[];
  defaultModel?: string;
  enabledPluginIds?: string[];
};

export type ModelPolicyResult = { ok: true } | { ok: false; status: number; error: string };
export type DefaultModelResult = { ok: true; body: string } | { ok: false; status: number; error: string };

export function effectiveRequestPolicy(state: RuntimeState, headers: Headers, client: ClientIdentity): EffectiveRequestPolicy {
  const agentId = agentIdFromHeaders(headers);
  if (!agentId || client.source !== "api_key" || client.keyAgentLabel !== agentId) return {};
  const configAgent = state.configAgents.find((item) => item.id === agentId);
  const draft = state.agentDrafts.find((item) => item.id === agentId);
  const enabledPluginIds = draft?.enabledPluginIds ?? configAgent?.enabledPluginIds;
  return {
    agentId,
    allowedModels: configAgent?.allowedModels,
    defaultModel: configAgent?.defaultModel,
    enabledPluginIds: enabledPluginIds === undefined ? undefined : [...enabledPluginIds]
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

export function applyDefaultModel(policy: EffectiveRequestPolicy, body: string): DefaultModelResult {
  if (!policy.defaultModel) return { ok: true, body };
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: true, body };
    if (typeof parsed.model === "string" && parsed.model.trim()) return { ok: true, body };
    parsed.model = policy.defaultModel;
    return { ok: true, body: JSON.stringify(parsed) };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

function modelFromBody(body: string): string | undefined | false {
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    return typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : undefined;
  } catch {
    return false;
  }
}
