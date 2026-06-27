import type { IncomingMessage, ServerResponse } from "node:http";
import { validatePluginPolicyConstraints } from "../../../core/src/plugins/plugin-policy-constraints.ts";
import { parsePluginPolicyState, pluginPolicySchemaVersion, type PluginPolicyOverrides } from "../../../core/src/plugins/plugin-policy.ts";
import { explainEffectivePolicies, explainEffectivePolicyForPlugin } from "./plugin-policy-explain.ts";
import { builtinPluginDescriptorV2 } from "./plugin-platform.ts";
import { readJson, writeJson } from "./local-api-io.ts";
import { persistRuntimeSettings } from "./runtime-settings.ts";
import type { RuntimeState } from "./runtime-state.ts";

type TeamPolicyPayload = Record<string, unknown>;

export async function getGlobalPluginPolicy(_: IncomingMessage, res: ServerResponse, state: RuntimeState): Promise<void> {
  const global = state.pluginPolicyState.globalPluginPolicy ?? {};
  writeJson(res, 200, {
    pluginPolicySchemaVersion: state.pluginPolicyState.pluginPolicySchemaVersion,
    globalPluginPolicy: global,
    policyWarnings: state.pluginPolicyState.policyWarnings,
    lastValidatedAt: state.pluginPolicyState.lastValidatedAt
  });
}

export async function putGlobalPluginPolicy(req: IncomingMessage, res: ServerResponse, state: RuntimeState): Promise<void> {
  const body = await readJson(req);
  if (!isObject(body) || !isStringRecord(body)) {
    return writeJson(res, 400, { error: "invalid_policy_payload" });
  }
  const next = {
    ...state.pluginPolicyState,
    pluginPolicySchemaVersion: body.pluginPolicySchemaVersion ?? pluginPolicySchemaVersion,
    globalPluginPolicy: body.globalPluginPolicy ?? body,
    teamPluginPolicies: state.pluginPolicyState.teamPluginPolicies
  };
  const result = parsePluginPolicyState(next, builtinPluginDescriptorV2());
  if (!result.ok) return writeJson(res, 400, { error: "invalid_policy_payload", warnings: result.warnings });
  const constraints = validatePluginPolicyConstraints(result.state, builtinPluginDescriptorV2());
  if (constraints.ok === false) return writeJson(res, 400, { error: "plugin_policy_exceeds_global", warnings: constraints.errors });
  const previous = snapshotPolicyState(state);
  state.pluginPolicyState = result.state;
  try {
    await persistRuntimeSettings(state);
  } catch {
    state.pluginPolicyState = previous;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  return writeJson(res, 200, {
    pluginPolicySchemaVersion: state.pluginPolicyState.pluginPolicySchemaVersion,
    globalPluginPolicy: state.pluginPolicyState.globalPluginPolicy,
    policyWarnings: state.pluginPolicyState.policyWarnings,
    lastValidatedAt: state.pluginPolicyState.lastValidatedAt
  });
}

export async function getTeamPluginPolicy(req: IncomingMessage, res: ServerResponse, state: RuntimeState): Promise<void> {
  const pathTeamId = extractTeamId(req.url);
  if (!pathTeamId) return writeJson(res, 400, { error: "invalid_team_id" });
  const pluginPolicies = state.pluginPolicyState.teamPluginPolicies
    .filter((item) => item.teamId === pathTeamId)
    .reduce<Record<string, PluginPolicyOverrides>>((acc, item) => {
      if (item.overrides && Object.keys(item.overrides).length) acc[item.pluginId] = item.overrides;
      return acc;
    }, {});
  return writeJson(res, 200, { teamId: pathTeamId, pluginPolicySchemaVersion: state.pluginPolicyState.pluginPolicySchemaVersion, pluginPolicies, teamPluginPolicies: state.pluginPolicyState.teamPluginPolicies });
}

export async function putTeamPluginPolicy(req: IncomingMessage, res: ServerResponse, state: RuntimeState): Promise<void> {
  const pathTeamId = extractTeamId(req.url);
  if (!pathTeamId) return writeJson(res, 400, { error: "invalid_team_id" });
  const body = await readJson(req);
  if (!isObject(body) || !isStringRecord(body)) {
    return writeJson(res, 400, { error: "invalid_policy_payload" });
  }
  const teamPayload = isObject(body.pluginPolicies) ? body.pluginPolicies : body;
  const teamPolicies = Object.entries(teamPayload).map(([pluginId, raw]) => ({ pluginId, overrides: raw })).filter((item) => item.overrides !== null && isObject(item.overrides));
  const next = {
    ...state.pluginPolicyState,
    pluginPolicySchemaVersion: body.pluginPolicySchemaVersion ?? state.pluginPolicyState.pluginPolicySchemaVersion,
    teamPluginPolicies: [
      ...state.pluginPolicyState.teamPluginPolicies.filter((item) => item.teamId !== pathTeamId),
      ...teamPolicies.map((item) => ({ teamId: pathTeamId, pluginId: item.pluginId, overrides: item.overrides as PluginPolicyOverrides }))
    ]
  };
  const result = parsePluginPolicyState(next, builtinPluginDescriptorV2());
  if (!result.ok) return writeJson(res, 400, { error: "invalid_policy_payload", warnings: result.warnings });
  const constraints = validatePluginPolicyConstraints(result.state, builtinPluginDescriptorV2());
  if (constraints.ok === false) return writeJson(res, 400, { error: "plugin_policy_exceeds_global", warnings: constraints.errors });
  const previous = snapshotPolicyState(state);
  state.pluginPolicyState = result.state;
  try {
    await persistRuntimeSettings(state);
  } catch {
    state.pluginPolicyState = previous;
    return writeJson(res, 500, { error: "persist_failed" });
  }
  return writeJson(res, 200, {
    teamId: pathTeamId,
    pluginPolicySchemaVersion: state.pluginPolicyState.pluginPolicySchemaVersion,
    pluginPolicies: teamPayload
  });
}

export async function getPluginPolicyEffective(req: IncomingMessage, res: ServerResponse, state: RuntimeState): Promise<void> {
  const teamId = extractPathArg(req.url, /^\/__molenkopf\/plugin-policies\/effective\/([^/]+)$/);
  if (!teamId) return writeJson(res, 400, { error: "invalid_team_id" });
  return writeJson(res, 200, explainEffectivePolicies(state.pluginPolicyState, teamId));
}

export async function getPluginPolicyEffectiveForPlugin(req: IncomingMessage, res: ServerResponse, state: RuntimeState): Promise<void> {
  const match = extractTeamPluginPath(req.url);
  if (!match) return writeJson(res, 400, { error: "invalid_path" });
  const policy = explainEffectivePolicyForPlugin(state.pluginPolicyState, match.teamId, match.pluginId);
  if (!policy) return writeJson(res, 404, { error: "plugin_not_found" });
  return writeJson(res, 200, { teamId: match.teamId, pluginId: match.pluginId, ...policy });
}

function snapshotPolicyState(state: RuntimeState) {
  return JSON.parse(JSON.stringify(state.pluginPolicyState)) as RuntimeState["pluginPolicyState"];
}

function extractTeamId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = new URL(url, "http://local").pathname.match(/^\/__molenkopf\/plugin-policies\/teams\/([^/]+)$/);
  return match?.[1];
}

function extractPathArg(url: string | undefined, pattern: RegExp): string | undefined {
  if (!url) return undefined;
  const pathname = new URL(url, "http://local").pathname;
  const match = pathname.match(pattern);
  if (!match) return undefined;
  return match[1];
}

function extractTeamPluginPath(url: string | undefined): undefined | { teamId: string; pluginId: string } {
  if (!url) return undefined;
  const pathname = new URL(url, "http://local").pathname;
  const match = pathname.match(/^\/__molenkopf\/plugin-policies\/effective\/([^/]+)\/([^/]+)$/);
  if (!match) return undefined;
  return { teamId: match[1], pluginId: match[2] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => typeof key === "string");
}
