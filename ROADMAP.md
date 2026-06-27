# Molenkopf Roadmap

Current status: Molenkopf is a local proxy/control-plane with admin auth, scoped
API keys, project-attributed usage, imported Claude/Codex runtime profiles, and
audit-backed plugin workspaces. Product direction lives here. Older
target-design notes remain in these historical docs:

- `docs/MOLENKOPF_PLATFORM_PLAN.md`
- `docs/MOLENKOPF_PLATFORM_MILESTONES.md`
- `docs/MOLENKOPF_EXECUTION_PACKAGES.md`
- `docs/MOLENKOPF_EXECUTION_PACKAGES_2.md`
- `docs/THREAT_MODEL.md`
- `docs/ADMIN_DISTRIBUTION.md`

## Implemented Baseline

- Local HTTP proxy bound to `127.0.0.1` by default.
- OpenAI-compatible forwarding for `/v1/responses`, `/v1/chat/completions`, and other upstream paths.
- Anthropic-compatible target resolution through `ANTHROPIC_BASE_URL`.
- Optional plugin pipeline order captured in `packages/core/src/plugins/static-pipeline.ts`.
- Secret redaction with stable `[REDACTED_SECRET:kind:sha256:shortHash]` markers.
- Safe compression for logs, JSON, shell output, and stacktraces.
- Source code and diffs pass through in safe mode.
- Local retrieval store with `molenkopf://sha256/HASH` IDs.
- Audit manifests without full prompts, full responses, Authorization headers, Cookies, or unredacted secrets.
- SSE events and local API endpoints under `/__molenkopf/*`.
- Dashboard shell with Overview and Admin views. Overview contains signed-in
  user usage, teams, members, project keys, and connection commands; provider
  routing, plugin controls, runtime auth import, user/team management, and
  workspace links currently live under Admin.
- Live plugin toggles for optional local plugins; core safety remains active
  outside the plugin catalog.
- Context-compressor workspace with real audit-backed totals, consumer/API-key buckets, provider and endpoint breakdowns, token funnel, payload-delta vs compression-saved accounting, snapshot refresh, and grouped recent activity.
- Provider hub with default, env-based, local, and injected provider profiles selected through `/__molenkopf/providers/select`.
- First-class provider setup for OpenAI API keys, Anthropic API keys, Ollama local, local OpenAI-compatible servers, Claude CLI, and Codex CLI.
- Provider smoke tests are protocol-aware and do not switch the active provider.
- Root `/` redirects to the dashboard while `/v1/...` remains proxied upstream.
- Fixed, manual, and failover profile routing with env credentials, budgets, and health summaries.
- Local plugin SDK with permissions and remote plugin loading disabled.
- CI mode context packing and audit artifacts without remote issue-tracker calls.
- CLI commands: `proxy`, `compress-file`, `retrieve`, `inspect --last`, and `self-test`.
- Molenkopf-owned Claude/Codex CLI bridge with imported auth-profile isolation, safe diagnostics, and timeout/malformed-output classification.
- `node:test` unit coverage and proxy E2E coverage.

## Remaining Platform Work

- Release hygiene for product labels, package metadata, repo references, local
  data dirs, docs, scripts, and GitHub metadata.
- First-class Project registry for key labels, budgets, plugin policies, and
  retention policy.
- Durable provider policy and provider settings persistence.
- Claude/Codex runtime permission envelope and safe UI diagnostics.
- Retention policies, quotas, project scope, and paginated request APIs remain.
  Manual audit/retrieval purge exists.
- Explicit skip-reason counters for non-compressed payloads.
- Obsidian export with dry-run/apply guards.
- Release hygiene for tracked files, docs, and generated local state before PR handoff.

## Explicitly Deferred

- Remote issue-tracker integration.
- Remote plugin installation.

## Verification

Run:

```bash
npm test
```

Keep project files below repo line limits. Active release work is tracked in
GitHub issues, PRs, and the release workflow.
