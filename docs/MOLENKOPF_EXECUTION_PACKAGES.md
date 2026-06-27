# Molenkopf Execution Packages

Date: 2026-06-18

Status: historical execution plan. Use `ROADMAP.md` for current release work.

Concrete build packages for [MOLENKOPF_PLATFORM_PLAN.md](MOLENKOPF_PLATFORM_PLAN.md).
Implement EP0-EP8 here, then continue in [MOLENKOPF_EXECUTION_PACKAGES_2.md](MOLENKOPF_EXECUTION_PACKAGES_2.md).

## EP0: Source Truth And Release State

Dependency: none.

Owners: `README.md`, `ROADMAP.md`, `docs/*`, `package-lock.json`.

Build:
- Decide which untracked product files are canonical.
- Reconcile roadmap wording with current implementation reality.
- Mark plugin graph and agent drafts as transitional workspace metadata where needed.
- Keep plan docs under repo file-size limits.

Acceptance:
- No doc claims hardened multi-employee gateway behavior before it exists.
- `git status --short` has no surprise product behavior only in untracked files.

Verify:
- `git status --short`
- `cmd /c npm test`

## EP1: Safe Request Metadata

Dependency: EP0.

Owners: `packages/proxy/src/http/server.ts`,
`packages/proxy/src/http/safe-request-metadata.ts`,
`packages/core/src/manifest/audit-store.ts`.

Build:
- Create one canonical safe request metadata builder.
- Persist only safe path data; strip or redact query strings before audit/event/UI.
- Use same safe metadata for audit, SSE, dashboard, graph, and plugin data.

Acceptance:
- Query secrets cannot appear in `/requests`, latest audit, stats, dashboard,
  plugin pages, or SSE events.

Verify:
- Add proxy E2E with `?api_key=secret&prompt=...`.
- Add audit-store safe-manifest test.

## EP2: Recursive Redaction And Header Policy

Dependency: EP1.

Owners: `packages/core/src/security/secret-redactor.ts`,
`packages/core/src/pipeline/openai-request-rewriter.ts`,
`packages/proxy/src/http/header-utils.ts`.

Build:
- Redact nested JSON keys such as `password`, `token`, `authorization`, `api_key`.
- Strip `x-molenkopf-token` and local routing headers before upstream.
- Move toward provider-aware upstream auth instead of forwarding arbitrary cookies.

Acceptance:
- Structured secrets are redacted before compression, audit, storage, and UI.

Verify:
- Redactor and request-rewriter unit tests.
- Header forwarding tests.

## EP3: Molenkopf Token Service

Dependency: EP1 and EP2.

Owners: `packages/core/src/security/agent-token.ts`,
`packages/core/src/security/agent-access.ts`,
`packages/proxy/src/http/agent-registry.ts`.

Build:
- Generate `mk_<tokenId>_<secret>` tokens, including first-admin CLI bootstrap.
- Store token id, SHA-256 hash, scopes, owner, expiry, revoked state, last use.
- Verify with timing-safe comparison.

Acceptance:
- Raw token is shown once only; list/config/audit never return raw token.

Verify:
- Token generate/verify/revoke/expire tests.
- Registry persistence tests with temp data dir.

## EP4: Local API Auth Gate

Dependency: EP3.

Owners: `packages/proxy/src/http/auth.ts`, `packages/proxy/src/http/local-api.ts`,
`packages/proxy/src/http/server.ts`.

Build:
- Keep `/__molenkopf/health` public.
- Protect status/config/providers/plugins/agents/requests/audit/events by scope.
- Require `proxy:use` for `/v1/*`.
- Refuse non-loopback binds unless public bind is explicit.

Acceptance:
- Unauthenticated sensitive routes return `401`; insufficient scopes return `403`.
- Non-loopback bind without explicit opt-in fails at startup.

Verify:
- Local API auth tests.
- Public bind tests.
- Proxy token requirement tests.

## EP5: Provider Profiles And Forwarding

Dependency: EP4.

Owners: `packages/core/src/providers/*`, `packages/core/src/profiles/profile-router.ts`,
`packages/proxy/src/http/provider-forwarder.ts`,
`packages/proxy/src/http/credential-resolver.ts`.

Build:
- Unify `ProviderConfig` and `UpstreamProfile`.
- Resolve provider by authenticated agent profile, not one global active provider.
- Inject env credentials only at forwarding boundary.
- Add health, last status, failover, budget status, and provider-aware errors.

Acceptance:
- Two agents route to different upstreams in one proxy process.
- Env credentials reach upstream and never appear in UI/audit.

Verify:
- Provider router unit tests.
- Proxy E2E with two fake upstreams and two tokens.

## EP6: Streaming And API Surface

Dependency: EP5.

Owners: `packages/proxy/src/http/server.ts`,
`packages/proxy/src/http/provider-forwarder.ts`, `packages/proxy/src/cli/target.ts`.

Build:
- Preserve upstream `text/event-stream` chunks for streaming clients.
- Define OpenAI-compatible error shape for Molenkopf-originated `/v1/*` errors.
- Document Anthropic modes: OpenAI-compatible first, native adapter later.
- Add request/response size limits and timeout behavior.

Acceptance:
- Streaming clients receive chunks before upstream end.
- Oversized requests return stable `413`.

Verify:
- Fake SSE upstream proxy test.
- 413/timeout/error contract tests.

## EP7: Plugin Descriptor Runtime

Dependency: EP4 and EP5.

Owners: `packages/core/src/plugins/plugin-descriptor.ts`,
`packages/core/src/plugins/builtin-descriptors.ts`,
`packages/proxy/src/http/plugin-host.ts`,
`packages/proxy/src/http/plugin-workspace-registry.ts`.

Build:
- Convert built-ins to descriptors with hooks, permissions, data scopes, workspace.
- Emit plugin lifecycle events.
- Resolve plugin pages and data through a registry.
- Keep required safety behavior in Core instead of the plugin catalog.

Acceptance:
- Every visible plugin toggle changes behavior.

Verify:
- Descriptor uniqueness tests.
- Toggle runtime-effect tests.
- Workspace scoped-data tests.

## EP8: Real Compression Artifacts

Dependency: EP7.

Owners: `packages/core/src/pipeline/openai-request-rewriter.ts`,
`packages/core/src/compression/*`, `packages/core/src/store/*`,
`packages/core/src/manifest/audit-summary.ts`.

Build:
- Split compression savings from redaction and serialization savings.
- Commit retrieval excerpts only after compression succeeds.
- Store bounded redacted excerpts and derived summaries separately.
- Surface skipped reasons.
- Shipped slice: workspace now renders real audit-backed totals, account/API-key buckets, provider and endpoint breakdowns, and recent safe request rows.
- Shipped slice: JSON serialization deltas no longer count as compression savings when no item was compressed.

Acceptance:
- Saved tokens count only real committed compression artifacts.
- Workspace must never render full prompts, full responses, raw credentials, or fake savings.

Verify:
- Rewriter accounting tests.
- Retrieval no-abandoned-file tests.
- Audit summary tests.
- Plugin page and plugin data tests for safe workspace breakdowns.
