# Molenkopf Plugin Runtime Redesign

Status: historical target plan with partially implemented slices. The current
implemented plugin security contract is [MOLENKOPF_PLUGIN_API.md](MOLENKOPF_PLUGIN_API.md).

## Core Correction

Molenkopf top level is the control plane:

```text
providers
  -> profiles
  -> agents / employees
  -> plugin policies
  -> request routing
  -> audit / diagnostics
```

Plugins are encapsulated runtime capabilities:

```text
request / response context
  -> enabled plugin hooks
  -> plugin-owned metrics
  -> plugin-owned workspace
  -> scoped plugin data API
```

Therefore global dashboard cards such as `Compressed items` and `Saved tokens`
are wrong at the Molenkopf top level. They belong to the Context Compression
plugin workspace or to a clearly labelled audit view.

## Verified Current Owners

| Concern | Current owner | Problem |
| --- | --- | --- |
| Request lifecycle | `packages/proxy/src/http/server.ts` and `packages/proxy/src/http/plugin-pipeline.ts` | Request-path middleware is implemented for redaction/compression with capability enforcement. |
| Plugin metadata | `packages/core/src/plugins/plugin-descriptor.ts` and `packages/core/src/plugins/plugin-catalog.ts` | Descriptors declare type, traffic access, permissions, hooks, toggle policy, and workspaces. |
| Plugin SDK | `packages/core/src/plugins/plugin-sdk.ts` | Local registry exists; remote plugins stay disabled. |
| Static pipeline | `packages/core/src/plugins/static-pipeline.ts` | Names stages; generic hook runtime remains a target. |
| Plugin pages | `packages/proxy/src/http/plugin-page-loader.ts` | Folder lookup serves `packages/plugins/<id>/page.html`. |
| Plugin data | `packages/proxy/src/http/local-api.ts` | Pages receive broad audit-derived data by hard-coded plugin ID. |
| Provider routing | `packages/proxy/src/http/runtime-state.ts` | One global `activeProviderId`; agent/profile config is not enforced. |
| Dashboard top metrics | `packages/dashboard/src/app/Overview.tsx` | Shows signed-in user status and scoped usage surfaces. |
| Dashboard plugin hub | `packages/dashboard/src/app/ProviderSections.tsx` | Shows optional plugin lifecycle, traffic mutations, and workspace links. |
| Dashboard plugin accounting | `packages/plugins/context-compressor-plugin/page.html` | Builds plugin-specific totals from scoped plugin data. |

## Target Dashboard Boundaries

Top-level dashboard:

- active provider/profile
- provider credential configured state, without values
- agent/employee bindings and token state
- plugin registry: enabled state, permissions, workspace link
- request count, error count, warning count, latency, latest status
- audit explorer with safe redacted manifests
- config source, bind, SSE state, local API health

Not top-level:

- saved tokens
- compressed items
- retrieval IDs
- Obsidian graph nodes
- memory extraction state
- plugin-specific funnel charts
- plugin-specific storage state

Plugin workspaces:

- Context Compression owns before/after tokens, saved tokens, skip reasons,
  compressors used, retrieval IDs, and compression artifacts.
- Memory/Obsidian owns derived text-memory nodes, links, write/apply state, and
  vault export state.
- Core owns redaction counters and leak-prevention diagnostics.
- Audit owns manifest write/read state and retention diagnostics.

## Plugin Descriptor Contract

The descriptor is the source of truth for plugin page discovery, toggle
semantics, permissions, metrics, and hook phases.

Detailed interface sketch: [MOLENKOPF_PLUGIN_INTERFACE.md](MOLENKOPF_PLUGIN_INTERFACE.md).

## Runtime Flow

```text
incoming request
  -> authenticate Molenkopf token
  -> resolve agent
  -> resolve provider profile
  -> resolve plugin policy
  -> run enabled plugin hooks in phase order
  -> forward to API provider or local CLI provider
  -> run response/audit/event hooks
  -> expose only scoped plugin data
```

Top-level provider selection can remain as an admin fallback, but real employee
distribution requires per-agent profile routing.

## Local API Target

```text
GET  /__molenkopf/plugins
POST /__molenkopf/plugins/toggle
GET  /__molenkopf/plugins/:id/page
GET  /__molenkopf/plugins/:id/data
POST /__molenkopf/plugins/:id/trigger
```

Rules:

- `/plugins` returns descriptors without hook code and without raw secrets.
- `/plugins/:id/data` returns only declared `dataScopes`.
- `/plugins/:id/page` renders or serves the plugin workspace.
- `/plugins/:id/trigger` is opt-in and permission-gated.
- A toggle is visible only when it gates real optional plugin behavior.
- Required safety behavior belongs in Core instead of the plugin catalog.

## Provider And Agent Routing Target

Current config validates profiles, agents, and plugin policies but discards
them. Target normalized config must retain:

```text
providers[]
profiles[]        profileId -> providerId, models, budget, failover
pluginPolicies[]  policyId -> enabledPluginIds, config
agents[]          agentId -> profileId, pluginPolicyId, scopes, token hash
```

Request routing must become:

```text
request token / identity
  -> agent
  -> profile
  -> provider
  -> plugin policy
```

Local routing headers such as `x-molenkopf-agent` must not bypass provider
policy. Authentication and account ownership come from the Molenkopf API key.

## Safety Gates

- Strip query strings before audit/events/UI/plugin data.
- No full prompt or full response in audit, dashboard, events, plugin data, or logs.
- No provider credential values in any local API response.
- Prefer stdin for local CLI prompts; `inputMode: "argument"` needs an explicit
  unsafe warning because prompts can appear in process argv.
- Retrieval originals must be committed only after compression succeeds.
- Control APIs need auth before public binding is considered safe.

## Implementation Packages

1. Dashboard scope correction
   - Remove top-level `Compressed items` and `Saved tokens`.
   - Remove hard-coded context-compressor launch from plugin hub header.
   - Keep plugin hub as registry/admin only.
   - Verify with dashboard tests and browser smoke.

2. Plugin descriptor and registry
   - Add descriptor type and builtin descriptors.
   - Move catalog metadata into descriptors.
   - Test uniqueness, toggle policy, permissions, and workspace metadata.

3. Scoped plugin workspace data
   - Add `/__molenkopf/plugins/:id/data`.
   - Move hard-coded audit access behind descriptor data scopes.
   - Test compressor page cannot read provider/admin fields.

4. Hook runner slice
   - Introduce request hook runner with existing redaction/compression behavior.
   - Keep toggles limited to optional plugin runtime behavior.
   - Verify compressor-off forwards uncompressed while safety stays on.

5. Provider/profile/agent routing
   - Retain normalized profiles/agents/plugin policies.
   - Resolve provider per authenticated agent token.
   - Keep global provider selection as admin fallback only.
   - Verify two agents route to two providers in one process.

6. Safety hardening
   - Sanitize query path before audit/events/UI.
   - Fix retrieval write-after-success.
   - Add prompt/response canary tests.
   - Add CLI stdin/default safety tests.

## Verification Plan

```text
npm test
```

For visible dashboard changes, also run a browser smoke against the served dashboard and plugin pages.
