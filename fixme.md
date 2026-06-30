# Plugin platform follow-up backlog

This file tracks remaining plugin hardening work after the v0.1.6 release
preparation batch. Keep entries short and move implementation detail into tests
or docs when work starts.

## Completed in the current hardening batch

- Plugin action output schemas are enforced before API responses are returned.
- Project graph actions derive or load graph snapshots without requiring a prior
  dashboard data load.
- Project graph cache entries are scoped, TTL-bound, size-bound, and testable.
- Dashboard plugin policy editing now covers capabilities, actions, and
  descriptor-defined settings.
- Built-in plugin module registration is checked against descriptor v2 ids.

## Remaining work

- Replace raw inline plugin pages or harden CSP with strict hash/nonce handling.
- Add plugin performance budgets, timeout handling, and slow-operation events.
- Add sanitized plugin error taxonomy with non-sensitive correlation ids.
- Make descriptor v2 the single canonical source for all remaining registry,
  policy, catalog, and dashboard metadata.
- Define and document one project graph freshness and persistence model.
- Add a built-in plugin contract test matrix across descriptors, actions,
  policy behavior, output schemas, and sanitizer behavior.
- Split plugin implementation files by responsibility where they still mix
  descriptors, actions, storage, UI rendering, DTOs, and helpers.

## Release notes

- Do not ship with `.env` in the workspace root. The sensitive workspace check
  intentionally fails when that file exists.
- Run the full release gate after the local `.env` is moved or removed.
