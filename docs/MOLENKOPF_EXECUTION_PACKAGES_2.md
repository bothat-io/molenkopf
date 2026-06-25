# Molenkopf Execution Packages 2

Date: 2026-06-18

Status: historical execution plan continuation. Use `NEXT.md` for current
release work.

Continuation of [MOLENKOPF_EXECUTION_PACKAGES.md](MOLENKOPF_EXECUTION_PACKAGES.md).

## EP9: Memory And Obsidian

Dependency: EP8.

Owners: `packages/core/src/memory/*`, `packages/proxy/src/http/memory-api.ts`,
`packages/proxy/src/http/workspaces/obsidian-memory-page.ts`.

Build:
- Emit `SafeTextTransfer` from the safe text pipeline.
- Build derived `MemoryNode` and `MemoryEdge` store.
- Add bounded memory graph JSON API.
- Add Obsidian dry-run/apply with explicit vault root and path guards.

Acceptance:
- Graph is text-derived memory, not HTTP provider/status metadata.
- Dry-run writes no files; apply cannot escape selected vault root.

Verify:
- Memory extraction and merge tests.
- Obsidian serializer/dry-run/apply tests.

## EP10: Employee Operations UI

Dependency: EP3 through EP5.

Owners: `packages/dashboard/src/dashboard-panels-*`,
`packages/dashboard/src/dashboard-view-model-*`, `docs/ADMIN_DISTRIBUTION.md`.

Build:
- People/Agents screen with create, rotate, revoke, last seen, scopes, provider.
- Provider admin screen with add/update/disable and redacted credential refs.
- Setup snippets that show raw token only in creation/rotation modal.
- Agent detail usage: requests, errors, saved tokens, warnings, active policy.

Acceptance:
- New employee can be onboarded without seeing any upstream provider key.
- Revoked/rotated token status is visible and enforceable.

Verify:
- Dashboard view-model tests.
- Browser smoke for create snippet, revoke state, provider assignment.

## EP11: Audit Explorer And Retention

Dependency: EP1 through EP8.

Owners: `packages/core/src/manifest/audit-store.ts`,
`packages/core/src/manifest/audit-summary.ts`, `packages/proxy/src/http/local-api.ts`.

Build:
- Paginated `/__molenkopf/requests`.
- Bounded `/__molenkopf/audit/summary` with filters and cache invalidation.
- Retention status and purge operation for audit and retrieval stores.

Acceptance:
- Large histories do not require loading every manifest into the browser.
- Summary remains prompt-free and credential-free.

Verify:
- 1000-manifest fixture tests.
- Cursor/limit/filter tests.
- Retention purge tests.

## EP12: CLI Runtime Bridge

Dependency: EP5, EP7, EP8.

Owners: `packages/core/src/runtime/*`, `packages/proxy/src/runtime/*`.

Build:
- Runtime profiles for `codex exec`, `claude`, OpenAI API, Anthropic API, local providers.
- Run/event contract for subprocess lifecycle.
- Feed prompt/context through safety/compression/memory before runtime execution.
- Stream stdout/stderr events without raw full prompt/response logging.

Acceptance:
- One Codex CLI run and one Claude CLI run produce safe Molenkopf events.

Verify:
- Fake subprocess adapter tests.
- Codex stdin command-builder test.
- Claude session/resume contract test.

## EP13: Dashboard Console And Browser Verification

Dependency: EP10 and EP11.

Owners: `packages/dashboard/src/*`, `packages/proxy/src/http/plugin-page-loader.ts`.

Build:
- Split panel/style/view-model files by responsibility before growth.
- Requests Explorer, Audit, Memory, Plugins, Routing/Admin, People/Agents.
- Real backend summaries, no raw manifest flood.
- Desktop and mobile layout checks.

Acceptance:
- No overlapping UI, no duplicate live badge, no secret strings.

Verify:
- Dashboard unit tests.
- Browser smoke at desktop 1920/1440 and mobile 390.

## EP14: Roadmap And Release Gate

Dependency: all previous packages.

Owners: `README.md`, `ROADMAP.md`, `docs/*`, `package.json`.

Build:
- Reconcile docs to current implementation state after each milestone.
- Keep all docs under repo line limits.
- Define release checklist and rollback notes.
- Run full local tests and any configured external CI.

Acceptance:
- Docs and source agree on implemented, transitional, and deferred behavior.
- Release candidate can be verified from tracked files only.

Verify:
- `cmd /c npm test`
- docs line-count check
- `git status --short`

## Parallelization Rules

- EP1 and EP2 can run in parallel only if they do not touch the same functions.
- EP3 token service can start while EP1 tests are being finalized.
- EP5 must wait for EP3 and EP4 because routing depends on identity.
- EP7 can begin descriptor design while EP5 routing is built, but hook execution
  should merge after provider forwarding is stable.
- EP9 must not write vault files before EP1-EP4 are complete.
- EP10 UI may mock new contracts, but must not merge before backend contracts exist.
