# Molenkopf Platform Milestones

Date: 2026-06-18

Status: historical target milestone plan. Use `NEXT.md` for current release
work.

This file expands the implementation order for
[MOLENKOPF_PLATFORM_PLAN.md](MOLENKOPF_PLATFORM_PLAN.md). Verification details
live in [MOLENKOPF_PLATFORM_VERIFICATION.md](MOLENKOPF_PLATFORM_VERIFICATION.md).
Concrete packages live in [MOLENKOPF_EXECUTION_PACKAGES.md](MOLENKOPF_EXECUTION_PACKAGES.md)
and [MOLENKOPF_EXECUTION_PACKAGES_2.md](MOLENKOPF_EXECUTION_PACKAGES_2.md).

## M0: Truth And Current UI

Started:
- Dashboard width increased to `1680px`.
- Header now has one visible connection status badge.
- Focused dashboard tests pass.

Acceptance:
- Docs distinguish implemented, transitional, and deferred work.
- Current transition boundaries are explicit.

## M1: Safety Boundary First

Owners: `packages/core/src/security/*`, `packages/core/src/manifest/*`,
`packages/proxy/src/http/header-utils.ts`, `packages/proxy/src/http/server.ts`.

Build:
- Safe manifest builder before audit write.
- Query-string stripping/redaction.
- Recursive secret-key redaction for JSON.
- `x-molenkopf-token` stripped before upstream.
- No full prompt/response fields in audit types.

Acceptance:
- Query tokens, auth headers, cookies, prompts, responses, and raw provider keys
  are absent from audit, dashboard, plugin pages, and exports.

## M2: Real Agent Auth

Owners: `packages/core/src/security/agent-token.ts`,
`packages/core/src/security/agent-access.ts`,
`packages/proxy/src/http/agent-registry.ts`, `packages/proxy/src/http/auth.ts`.

Build:
- CLI bootstrap creates the first admin token and prints its raw value once.
- Token creation, hash verify, revoke, rotate, expiry, last-used updates.
- Protect all local APIs except health.
- `proxy:use` required for `/v1/*`.
- Dashboard token entry is memory-only, not localStorage.

Acceptance:
- Employee can use Molenkopf with an `mk_...` token.
- Upstream provider key is never exposed.
- Revoked and expired tokens fail deterministically.

## M3: Provider Control Plane

Owners: `packages/core/src/providers/*`,
`packages/core/src/profiles/profile-router.ts`,
`packages/proxy/src/http/provider-forwarder.ts`,
`packages/proxy/src/http/credential-resolver.ts`.

Build:
- Unified provider/profile contract.
- Per-agent provider selection.
- Env credential injection at forwarding only.
- Health probes, failover, budget status.
- Streaming pass-through for OpenAI-compatible SSE responses.
- Provider-aware headers and error contracts.
- OpenAI-compatible base URL setup snippets.

Acceptance:
- Two agents can route to two different providers in the same process.
- Provider views stay redacted.
- Failover behavior is covered by tests.

## M4: Plugin Runtime

Owners: `packages/core/src/plugins/plugin-descriptor.ts`,
`packages/core/src/plugins/builtin-descriptors.ts`,
`packages/core/src/plugins/plugin-runtime.ts`, `packages/proxy/src/http/plugin-host.ts`,
`packages/proxy/src/http/plugin-workspace-registry.ts`.

Build:
- Descriptor-backed built-ins.
- Hook phases for redaction, compression, audit, events, routing, memory.
- Lifecycle events.
- Scoped `/__molenkopf/plugins/:id/data`.
- Workspace renderers resolved by registry.

Acceptance:
- Every visible plugin toggle has a runtime effect.
- Plugin pages can read only declared safe data scopes.

## M5: Real Compression Accounting

Owners: `packages/core/src/pipeline/openai-request-rewriter.ts`,
`packages/core/src/compression/*`, `packages/core/src/store/*`,
`packages/core/src/manifest/audit-summary.ts`.

Build:
- Split counters for original, forwarded, compression saved, redaction saved,
  serialization saved, skipped items, and skip reasons.
- Commit retrieval artifacts only after compression succeeds.
- Store redacted originals and derived summaries separately.
- Backend-owned summary for dashboard/plugin pages.

Acceptance:
- Saved tokens count only committed compression artifacts.
- Source code and diffs pass through in safe mode.

## M6: Memory And Obsidian

Owners: `packages/core/src/memory/*`, `packages/proxy/src/http/memory-api.ts`,
`packages/proxy/src/http/workspaces/obsidian-memory-page.ts`.

Build:
- `SafeTextTransfer` emitted from the safe text pipeline.
- Derived `MemoryNode` and `MemoryEdge` store.
- Graph JSON API.
- Obsidian dry-run and apply with explicit vault root.
- Markdown serializer with source hashes and wiki links.

Acceptance:
- Graph is derived from transferred text and memory summaries, not HTTP status metadata.
- Dry-run writes no files.
- Apply writes only inside the selected vault root.

## M7: Operator Dashboard

Owners: `packages/dashboard/src/dashboard-panels-*`,
`packages/dashboard/src/dashboard-view-model-*`, `packages/dashboard/src/dashboard-style-*`.

Build:
- Split panels, styles, and view models before files grow.
- Routing/Admin, People/Agents, Plugins, Requests Explorer, Audit, Memory, Settings.
- Employee setup snippets with redacted tokens.
- Wide console plus mobile stacked layout.

Acceptance:
- Dashboard uses backend summaries, not raw manifests for large histories.
- Browser smoke proves desktop/mobile layout has no overlap.

## M8: CLI Runtime Bridge

Owners: `packages/proxy/src/runtime/*`, `packages/core/src/runtime/*`.

Build:
- Runtime profiles for `codex exec`, `claude`, OpenAI API, Anthropic API, and
  local OpenAI-compatible providers.
- Prompt/context stream goes through Molenkopf safety/compression/memory first.
- Subprocess events stream back without raw full prompt/response logging.

Acceptance:
- One Codex CLI run and one Claude CLI run produce Molenkopf-visible safe
  compression/accounting/memory events.

## M9: Team Operations

Build:
- Admin create/list/revoke tokens.
- Provider/profile assignment.
- Usage by employee/agent/provider/plugin.
- Rotation guide and redacted setup snippets.
- Retention and export controls.

Acceptance:
- A new employee can be onboarded without seeing any upstream provider key.
- Admin can revoke access and see last-used diagnostics.

## Verification

Use [MOLENKOPF_PLATFORM_VERIFICATION.md](MOLENKOPF_PLATFORM_VERIFICATION.md).
